import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  CommissionTierChangeLog,
  CommissionTierOperationType,
} from './commission-tier-change-log.entity';
import { CommissionTier } from './commission-tier.entity';
import { UpsertCommissionTierDto } from './dto/upsert-commission-tier.dto';
import { ruleComplete } from './rule-complete.util';

export interface CommissionTierListResult {
  tiers: CommissionTier[];
  ruleComplete: boolean;
}

interface TierSnapshot {
  lowerBound: number;
  upperBound: number | null;
  unitPrice: number;
  /** Old snapshots omit this field and used (lowerBound, upperBound]. */
  rangeSemantics?: 'inclusive';
}

export interface ChangeLogItemDto {
  operationType: CommissionTierOperationType;
  operator: string;
  changedAt: Date;
  beforeSnapshot: TierSnapshot | null;
  afterSnapshot: TierSnapshot | null;
}

/** 运行时类型守卫：JSON 字段读取后不可信，格式异常不进入下游（BE-JSON-01）。 */
function isTierSnapshot(value: unknown): value is TierSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.lowerBound === 'number' &&
    typeof candidate.unitPrice === 'number' &&
    (candidate.upperBound === null ||
      typeof candidate.upperBound === 'number') &&
    (candidate.rangeSemantics === undefined ||
      candidate.rangeSemantics === 'inclusive')
  );
}

function parseSnapshot(raw: string | null): TierSnapshot | null {
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isTierSnapshot(parsed) ? parsed : null;
}

function toSnapshot(tier: {
  lowerBound: number;
  upperBound: number | null;
  unitPrice: number;
}): TierSnapshot {
  return {
    lowerBound: tier.lowerBound,
    upperBound: tier.upperBound,
    unitPrice: tier.unitPrice,
    rangeSemantics: 'inclusive',
  };
}

/**
 * 提成阶梯规则 CRUD + 冲突/完整性判定 + 变更日志（TRD §接口：/api/commission-tiers*，
 * PRD AC-10~AC-13）。每档独立提交、立即生效；无整表批量保存概念（do-not）。
 */
@Injectable()
export class CommissionTierService {
  constructor(
    @InjectRepository(CommissionTier)
    private readonly commissionTierRepository: Repository<CommissionTier>,
    @InjectRepository(CommissionTierChangeLog)
    private readonly changeLogRepository: Repository<CommissionTierChangeLog>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<CommissionTierListResult> {
    const tiers = await this.commissionTierRepository.find({
      order: { lowerBound: 'ASC' },
    });
    return { tiers, ruleComplete: ruleComplete(tiers) };
  }

  async create(
    dto: UpsertCommissionTierDto,
    operator: string,
  ): Promise<CommissionTier> {
    this.assertBoundsOrdered(dto);
    // 「读其余档位 → 冲突校验 → 落库 → 写变更日志」整体包在一个事务里：
    // 两个几乎同时提交的、区间确实重叠的新增请求，如果各自在独立的
    // 非事务读写间隙里完成校验，理论上都能读到冲突校验通过前的旧快照、都成功落库，
    // 破坏"阶梯表不重叠"这个核心不变式（该表无版本快照、不支持回滚）。
    // 事务 + （仅 mysql 下）悲观写锁把这段读-判断-写变成一个不可分割的临界区。
    // 显式钉死 SERIALIZABLE（mysql/sqlite 两种驱动均支持，REPEATABLE READ 在 sqlite 下不受支持）：
    // 不依赖数据库服务器的默认隔离级别配置，避免服务端改成 READ COMMITTED 后间隙锁失效、竞态窗口重新打开。
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const others = await this.loadTiersForConflictCheck(manager);
      this.assertNoConflict(dto, others);

      const tier = manager.create(CommissionTier, {
        lowerBound: dto.lowerBound,
        upperBound: dto.upperBound ?? null,
        unitPrice: dto.unitPrice,
      });
      const saved = await manager.save(tier);
      await this.writeChangeLog(
        manager,
        'create',
        operator,
        null,
        toSnapshot(saved),
      );
      return saved;
    });
  }

  async update(
    id: string,
    dto: UpsertCommissionTierDto,
    operator: string,
  ): Promise<CommissionTier> {
    // 同 create()：整段读-判断-写包进一个事务，避免并发编辑各自读到过期快照后都通过校验；
    // 隔离级别钉死 SERIALIZABLE 的理由同上。
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const existing = await manager.findOne(CommissionTier, {
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException('阶梯档位不存在');
      }
      this.assertBoundsOrdered(dto);
      const others = await this.loadTiersForConflictCheck(manager, id);
      this.assertNoConflict(dto, others);

      const before = toSnapshot(existing);
      existing.lowerBound = dto.lowerBound;
      existing.upperBound = dto.upperBound ?? null;
      existing.unitPrice = dto.unitPrice;
      const saved = await manager.save(existing);
      await this.writeChangeLog(
        manager,
        'update',
        operator,
        before,
        toSnapshot(saved),
      );
      return saved;
    });
  }

  async remove(id: string, operator: string): Promise<void> {
    // 同 create()/update()：删除与写变更日志包进一个事务，避免中途崩溃出现
    // "档位已删但无变更日志"的不一致状态；删除操作无并发冲突校验可言，
    // 隔离级别沿用 SERIALIZABLE 只是为了与另两个方法保持一致，非本操作必需。
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const existing = await manager.findOne(CommissionTier, {
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException('阶梯档位不存在');
      }
      const before = toSnapshot(existing);
      await manager.remove(existing);
      await this.writeChangeLog(manager, 'delete', operator, before, null);
    });
  }

  /**
   * 事务内查询"其余档位"用于冲突校验。仅 mysql（生产）驱动对 commission_tier
   * 加悲观写锁（SELECT ... FOR UPDATE），把本次事务与其他并发事务的同一批读操作
   * 串行化，防止两笔并发请求都读到冲突校验通过前的旧数据、都落库出重叠区间。
   * sqlite（本地开发/自动化测试，走 better-sqlite3 驱动）不支持该锁模式——TypeORM
   * 会抛 LockNotSupportedOnGivenDriverError——因此该驱动下跳过加锁，仅依赖事务本身
   * 的写序列化语义；sqlite 单连接执行的特性下这已经足够覆盖测试场景。
   */
  private async loadTiersForConflictCheck(
    manager: EntityManager,
    excludeId?: string,
  ): Promise<CommissionTier[]> {
    if (this.dataSource.options.type === 'mysql') {
      const qb = manager
        .getRepository(CommissionTier)
        .createQueryBuilder('tier')
        .setLock('pessimistic_write');
      if (excludeId !== undefined) {
        qb.where('tier.id != :excludeId', { excludeId });
      }
      return qb.getMany();
    }

    const tiers = await manager.find(CommissionTier);
    return excludeId === undefined
      ? tiers
      : tiers.filter((tier) => tier.id !== excludeId);
  }

  async findChangeLogs(): Promise<ChangeLogItemDto[]> {
    const logs = await this.changeLogRepository.find({
      order: { changedAt: 'DESC' },
    });
    return logs.map((log) => ({
      operationType: log.operationType,
      operator: log.operator,
      changedAt: log.changedAt,
      beforeSnapshot: parseSnapshot(log.beforeSnapshot),
      afterSnapshot: parseSnapshot(log.afterSnapshot),
    }));
  }

  /**
   * lowerBound <= upperBound（闭区间允许单票档；upperBound 为空视为"及以上"）。
   * upperBound 未提供时既可能是省略该字段（值为 undefined），也可能是客户端
   * 按 JSON 惯例显式传 null（class-validator 的 @IsOptional 对显式 null 同样
   * 跳过后续校验器）——两种写法语义等价，都要跳过比较，否则 null 会被 JS 的
   * `>` 运算符隐式转换成 0 参与比较，把合法的无上限区间请求误判为非法。
   */
  private assertBoundsOrdered(dto: UpsertCommissionTierDto): void {
    if (
      dto.upperBound !== undefined &&
      dto.upperBound !== null &&
      dto.lowerBound > dto.upperBound
    ) {
      throw new BadRequestException('下限不能大于上限');
    }
  }

  /**
   * 档位两端均包含；新下限等于已有上限时重叠一票。
   * 留空隙不算重叠，允许保存，但完整性校验会阻止提成计算。
   */
  private assertNoConflict(
    dto: UpsertCommissionTierDto,
    others: CommissionTier[],
  ): void {
    const newUpper = dto.upperBound ?? Infinity;
    const conflict = others.find((tier) => {
      const otherUpper = tier.upperBound ?? Infinity;
      return dto.lowerBound <= otherUpper && tier.lowerBound <= newUpper;
    });
    if (conflict) {
      const conflictUpper =
        conflict.upperBound === null ? '及以上' : conflict.upperBound;
      throw new ConflictException(
        `与已有档位 [${conflict.lowerBound}, ${conflictUpper}] 区间重叠`,
      );
    }
  }

  private async writeChangeLog(
    manager: EntityManager,
    operationType: CommissionTierOperationType,
    operator: string,
    before: TierSnapshot | null,
    after: TierSnapshot | null,
  ): Promise<void> {
    const log = manager.create(CommissionTierChangeLog, {
      operationType,
      operator,
      changedAt: new Date(),
      beforeSnapshot: before ? JSON.stringify(before) : null,
      afterSnapshot: after ? JSON.stringify(after) : null,
    });
    await manager.save(log);
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PageResultDto } from '../common/dto/page-result.dto';
import { QueryPolicyRecordDto } from './dto/query-policy-record.dto';
import { UpdateSalesNameDto } from './dto/update-sales-name.dto';
import { UpdateWorkOrderNoDto } from './dto/update-work-order-no.dto';
import { PolicyRecord } from './policy-record.entity';
import { SalesFillLog, SalesFillLogFieldName } from './sales-fill-log.entity';

export interface SalesFillLogItemDto {
  operator: string;
  changedAt: Date;
  oldValue: string | null;
  newValue: string;
  fieldName: SalesFillLogFieldName;
}

/**
 * 无多租户/权限边界（foundation.md 已判定数据隔离不适用），
 * 直接用标准 TypeORM Repository，无需作用域 base repo。
 */
@Injectable()
export class PolicyRecordService {
  constructor(
    @InjectRepository(PolicyRecord)
    private readonly policyRecordRepository: Repository<PolicyRecord>,
    @InjectRepository(SalesFillLog)
    private readonly salesFillLogRepository: Repository<SalesFillLog>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * updateSalesName()/updateWorkOrderNo() 共用：事务内按行锁读取，避免二者并发写同一条
   * 记录时后提交的事务基于过期快照覆盖掉先提交事务的结果（丢失更新）。better-sqlite3
   * 驱动（本仓 e2e 测试路径）不支持行锁，仅在 mysql（生产/开发实际使用的驱动）下加锁，
   * 其余驱动退化为普通读——sqlite 场景本身是单连接执行，不存在真实的跨事务并发窗口。
   */
  private async findOneForUpdate(
    manager: EntityManager,
    id: string,
  ): Promise<PolicyRecord | null> {
    if (this.dataSource.options.type === 'mysql') {
      return manager.findOne(PolicyRecord, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
    }
    return manager.findOne(PolicyRecord, { where: { id } });
  }

  async findPage(
    query: QueryPolicyRecordDto,
  ): Promise<PageResultDto<PolicyRecord>> {
    const { page, pageSize } = query;
    const [list, total] = await this.policyRecordRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return new PageResultDto(list, total, page, pageSize);
  }

  /**
   * 人工补录销售人员（TRD §接口：PATCH .../sales-name，PRD AC-08，golden example）：
   * 事务内先读旧值 → 更新 salesName + sales_fill_source='manual' → 插入补录日志 →
   * 返回更新后的完整记录；已是 system/manual 的记录允许反复覆盖（do-not 未限制，
   * known-risks 已记录该设计会改变下游提成归属，非本包缺陷）。
   * 行锁读取：与 updateWorkOrderNo() 可能并发写同一条记录，避免丢失更新，见
   * findOneForUpdate() 注释。
   */
  async updateSalesName(
    id: string,
    dto: UpdateSalesNameDto,
    operator: string,
  ): Promise<PolicyRecord> {
    return this.dataSource.transaction(async (manager) => {
      const record = await this.findOneForUpdate(manager, id);
      if (!record) {
        throw new NotFoundException('保单记录不存在');
      }

      const oldValue = record.salesName;
      record.salesName = dto.salesName;
      record.salesFillSource = 'manual';
      const saved = await manager.save(record);

      // 只增不改不删：每次修改都新增一条日志，不覆盖/不删除旧日志（TRD §表：销售人员补录日志）。
      // 显式传 fieldName（不依赖 DB 默认值）：本方法的业务语义就是"销售人员"字段的修改。
      await manager.save(
        manager.create(SalesFillLog, {
          policyRecordId: id,
          operator,
          changedAt: new Date(),
          oldValue,
          newValue: dto.salesName,
          fieldName: 'salesName',
        }),
      );

      return saved;
    });
  }

  /**
   * 更正工作单号（本任务新增）：事务内先读旧值 → 更新 workOrderNo → 写入一条
   * field_name='workOrderNo' 的日志 → 若 resetFillStatus 为 true 且更新前
   * salesFillSource !== 'unmatched'，额外把 salesName 置 null、salesFillSource 置
   * 'unmatched'（此重置是工作单号修改的连带效应，不是补录动作，不单独产生一条销售人员
   * 变更日志，一次操作只写一条日志——do-not 边界）。
   * 行锁读取：与 updateSalesName() 可能并发写同一条记录，理由同 findOneForUpdate() 注释。
   */
  async updateWorkOrderNo(
    id: string,
    dto: UpdateWorkOrderNoDto,
    operator: string,
  ): Promise<PolicyRecord> {
    return this.dataSource.transaction(async (manager) => {
      const record = await this.findOneForUpdate(manager, id);
      if (!record) {
        throw new NotFoundException('保单记录不存在');
      }

      const oldValue = record.workOrderNo;
      const wasUnmatched = record.salesFillSource === 'unmatched';
      record.workOrderNo = dto.workOrderNo;
      if (dto.resetFillStatus && !wasUnmatched) {
        record.salesName = null;
        record.salesFillSource = 'unmatched';
      }
      const saved = await manager.save(record);

      await manager.save(
        manager.create(SalesFillLog, {
          policyRecordId: id,
          operator,
          changedAt: new Date(),
          oldValue,
          newValue: dto.workOrderNo,
          fieldName: 'workOrderNo',
        }),
      );

      return saved;
    });
  }

  /**
   * 修改历史查看（TRD §接口：GET .../sales-fill-logs，PRD AC-09；本任务扩展为销售人员+
   * 工作单号两类修改统一按 changedAt 倒序返回，各自标注 fieldName，不分接口）：
   * 裸数组非分页；记录不存在 1004；从未被人工修改过时返回空数组。
   */
  async findSalesFillLogs(id: string): Promise<SalesFillLogItemDto[]> {
    const record = await this.policyRecordRepository.findOne({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException('保单记录不存在');
    }

    const logs = await this.salesFillLogRepository.find({
      where: { policyRecordId: id },
      order: { changedAt: 'DESC' },
    });

    return logs.map((log) => ({
      operator: log.operator,
      changedAt: log.changedAt,
      oldValue: log.oldValue,
      newValue: log.newValue,
      fieldName: log.fieldName,
    }));
  }
}

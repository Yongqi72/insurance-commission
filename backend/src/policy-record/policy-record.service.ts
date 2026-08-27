import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PageResultDto } from '../common/dto/page-result.dto';
import { QueryPolicyRecordDto } from './dto/query-policy-record.dto';
import { UpdateSalesNameDto } from './dto/update-sales-name.dto';
import { PolicyRecord } from './policy-record.entity';
import { SalesFillLog } from './sales-fill-log.entity';

export interface SalesFillLogItemDto {
  operator: string;
  changedAt: Date;
  oldValue: string | null;
  newValue: string;
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
   */
  async updateSalesName(
    id: string,
    dto: UpdateSalesNameDto,
    operator: string,
  ): Promise<PolicyRecord> {
    return this.dataSource.transaction(async (manager) => {
      const record = await manager.findOne(PolicyRecord, { where: { id } });
      if (!record) {
        throw new NotFoundException('保单记录不存在');
      }

      const oldValue = record.salesName;
      record.salesName = dto.salesName;
      record.salesFillSource = 'manual';
      const saved = await manager.save(record);

      // 只增不改不删：每次修改都新增一条日志，不覆盖/不删除旧日志（TRD §表：销售人员补录日志）。
      await manager.save(
        manager.create(SalesFillLog, {
          policyRecordId: id,
          operator,
          changedAt: new Date(),
          oldValue,
          newValue: dto.salesName,
        }),
      );

      return saved;
    });
  }

  /**
   * 补录历史查看（TRD §接口：GET .../sales-fill-logs，PRD AC-09）：按 changedAt 倒序，
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
    }));
  }
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { numericIdTransformer } from '../common/transformers/numeric-id.transformer';

/**
 * 销售人员补录日志：人工补录/修改 policy_record.sales_name 的操作历史
 * （V1 新表，TRD §表：销售人员补录日志）。只增不改不删，无 update/delete 入口。
 * `policyRecordId` 外键在 migration 中定义为 ON DELETE CASCADE（硬删除导入时不留孤儿日志）。
 */
@Entity('sales_fill_log')
export class SalesFillLog {
  @PrimaryColumn({
    type: 'int',
    generated: 'increment',
    transformer: numericIdTransformer,
  })
  id: string;

  @Index()
  @Column({
    name: 'policy_record_id',
    type: 'int',
    transformer: numericIdTransformer,
  })
  policyRecordId: string;

  /** 操作人，取自当前登录管理员 */
  @Column({ name: 'operator', type: 'varchar', length: 64 })
  operator: string;

  @Column({ name: 'changed_at', type: 'datetime' })
  changedAt: Date;

  @Column({ name: 'old_value', type: 'varchar', length: 64, nullable: true })
  oldValue: string | null;

  @Column({ name: 'new_value', type: 'varchar', length: 64 })
  newValue: string;
}

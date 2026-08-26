import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { numericIdTransformer } from '../common/transformers/numeric-id.transformer';

export type CommissionTierOperationType = 'create' | 'update' | 'delete';

/**
 * 提成阶梯规则变更日志：CRUD 操作历史快照（V1 新表，TRD §表：提成阶梯规则变更日志）。
 * 只增不改不删。`beforeSnapshot`/`afterSnapshot` 为 JSON 字符串（结构
 * `{lowerBound, upperBound, unitPrice}`），API 层返回时统一解析为对象（BE-JSON-01：
 * 读取后须用类型守卫验证，属后续 Service 任务范畴，本任务仅落 Entity 列类型）。
 */
@Entity('commission_tier_change_log')
export class CommissionTierChangeLog {
  @PrimaryColumn({
    type: 'int',
    generated: 'increment',
    transformer: numericIdTransformer,
  })
  id: string;

  @Column({ name: 'operation_type', type: 'varchar', length: 16 })
  operationType: CommissionTierOperationType;

  @Column({ name: 'operator', type: 'varchar', length: 64 })
  operator: string;

  /** 建索引支撑倒序列表 */
  @Index()
  @Column({ name: 'changed_at', type: 'datetime' })
  changedAt: Date;

  /** create 时为空 */
  @Column({ name: 'before_snapshot', type: 'text', nullable: true })
  beforeSnapshot: string | null;

  /** delete 时为空 */
  @Column({ name: 'after_snapshot', type: 'text', nullable: true })
  afterSnapshot: string | null;
}

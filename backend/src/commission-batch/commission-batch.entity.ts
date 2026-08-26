import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericIdTransformer } from '../common/transformers/numeric-id.transformer';

export type CommissionBatchStatus = 'doing' | 'done';

/**
 * 提成批次：一次导入-回填-提成统计的边界单位（V1 新表，TRD §表：提成批次）。
 * 主键为 BIGINT 自增，字段声明为 string 并经 numericIdTransformer（BE-TYPEORM-02），
 * 与 policy_record.import_batch_id（V0 已建 bigint 列）类型对齐。
 */
@Entity('commission_batch')
export class CommissionBatch {
  @PrimaryColumn({
    type: 'bigint',
    generated: 'increment',
    transformer: numericIdTransformer,
  })
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 128 })
  name: string;

  /** 枚举 doing｜done，默认 doing（TRD §表：提成批次） */
  @Column({ name: 'status', type: 'varchar', length: 16, default: 'doing' })
  status: CommissionBatchStatus;

  /** 建索引支撑批次列表默认倒序（TRD §表：提成批次） */
  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

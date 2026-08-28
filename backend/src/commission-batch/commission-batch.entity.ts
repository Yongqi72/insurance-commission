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
 * 真实 MySQL 物理列为 BIGINT 自增（见 migrations/*-CreateCommissionTablesAndAlterPolicyRecord.ts，
 * synchronize:false 下由 migration 独立建表，不受本装饰器 type 取值影响），
 * 与 policy_record.import_batch_id（V0 已建 bigint 列）类型对齐。
 * 装饰器 type 改为与其余 5 个实体一致的 'int'：原 'bigint' 取值会导致
 * SQLite 驱动 synchronize 建表时抛出 "AUTOINCREMENT is only allowed on an INTEGER PRIMARY
 * KEY"（bigint 主键 + generated:increment 在 sqlite 下不受支持，见 numeric-id.transformer.ts
 * 注释与 commission-batch.entity.spec.ts 对该限制的说明），阻断任何依赖 AppModule 整体启动
 * 的 sqlite 沙箱 e2e/本地开发；字段声明仍为 string 并经 numericIdTransformer（BE-TYPEORM-02）。
 */
@Entity('commission_batch')
export class CommissionBatch {
  @PrimaryColumn({
    type: 'int',
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

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../common/transformers/decimal.transformer';
import { numericIdTransformer } from '../common/transformers/numeric-id.transformer';

/**
 * 提成阶梯规则：按票数区间定义单价（V1 新表，TRD §表：提成阶梯规则）。
 * `unitPrice` 为 DECIMAL 金额字段，经 decimalTransformer 序列化为 number（BE-TYPEORM-03）。
 * 请求 DTO 校验 unit_price > 0、最多两位小数且 <= 99999999.99，
 * lower_bound >= 0；数据库字段本身只负责持久化。
 */
@Entity('commission_tier')
export class CommissionTier {
  @PrimaryColumn({
    type: 'int',
    generated: 'increment',
    transformer: numericIdTransformer,
  })
  id: string;

  /** 下限票数，≥0；建索引支撑按下限排序展示 + 冲突校验查询 */
  @Index()
  @Column({ name: 'lower_bound', type: 'int' })
  lowerBound: number;

  /** 上限票数，可空——空表示"及以上" */
  @Column({ name: 'upper_bound', type: 'int', nullable: true })
  upperBound: number | null;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  unitPrice: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

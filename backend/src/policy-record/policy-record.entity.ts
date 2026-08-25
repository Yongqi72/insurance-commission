import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../common/transformers/decimal.transformer';
import { numericIdTransformer } from '../common/transformers/numeric-id.transformer';

/**
 * 保单记录：从月度/分站账单 Excel 导入的单条保单数据（V1 功能），
 * V0 走骨架仅建表结构 + 列表读接口，不建导入链路。
 * 主键为默认自增整数（非 BIGINT，原因见 numeric-id.transformer.ts 注释），
 * 经 transformer 统一序列化为 string；工作单号/保单号唯一（BE-DB-01）。
 */
@Entity('policy_record')
export class PolicyRecord {
  @PrimaryColumn({
    type: 'int',
    generated: 'increment',
    transformer: numericIdTransformer,
  })
  id: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 128 })
  customerName: string;

  @Column({ name: 'work_order_no', type: 'varchar', length: 64, unique: true })
  workOrderNo: string;

  @Column({ name: 'business_type', type: 'varchar', length: 64 })
  businessType: string;

  @Column({ name: 'currency', type: 'varchar', length: 16 })
  currency: string;

  @Column({ name: 'policyholder', type: 'varchar', length: 128 })
  policyholder: string;

  @Column({
    name: 'insured_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: decimalTransformer,
  })
  insuredAmount: number;

  @Column({ name: 'policy_no', type: 'varchar', length: 64, unique: true })
  policyNo: string;

  /** 通过工作单号调第三方接口回填得到，回填前/失败时为空（V1 功能，V0 恒为空） */
  @Column({ name: 'sales_name', type: 'varchar', length: 64, nullable: true })
  salesName: string | null;

  /** 导入批次边界字段（V1 导入功能落地前恒为空），提成统计按此分组，批次间互不累计。
   * BIGINT 列，字段声明为 string（BE-TYPEORM-02）；transformer 统一跨驱动序列化为 string。 */
  @Column({
    name: 'import_batch_id',
    type: 'bigint',
    nullable: true,
    transformer: numericIdTransformer,
  })
  importBatchId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

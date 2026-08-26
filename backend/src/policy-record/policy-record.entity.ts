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

export type SalesFillSource = 'unmatched' | 'system' | 'manual';

/**
 * 保单记录：从月度/分站账单 Excel 导入的单条保单数据。
 * 主键为默认自增整数（非 BIGINT，原因见 numeric-id.transformer.ts 注释），
 * 经 transformer 统一序列化为 string。
 * V1 变更（TRD §表：保单记录）：work_order_no/policy_no 由唯一约束改为普通索引——
 * 真实数据同一工作单号可对应多条保单，V0 期的 unique:true 系设计过度约束，本期用正式
 * migration 移除（BE-DB-03），不再满足 BE-DB-01 唯一性场景。
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

  @Index()
  @Column({ name: 'work_order_no', type: 'varchar', length: 64 })
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

  @Index()
  @Column({ name: 'policy_no', type: 'varchar', length: 64 })
  policyNo: string;

  /** 通过工作单号调第三方接口回填得到，回填前/失败时为空 */
  @Column({ name: 'sales_name', type: 'varchar', length: 64, nullable: true })
  salesName: string | null;

  /** 导入批次边界字段，提成统计按此分组，批次间互不累计。
   * BIGINT 列，字段声明为 string（BE-TYPEORM-02）；transformer 统一跨驱动序列化为 string。
   * 本期启用并建索引支撑批次维度查询（TRD §表：保单记录），外键→commission_batch.id（ON DELETE RESTRICT）。 */
  @Index()
  @Column({
    name: 'import_batch_id',
    type: 'bigint',
    nullable: true,
    transformer: numericIdTransformer,
  })
  importBatchId: string | null;

  /** 保费，对应账单 Excel「保险金额」与「保单号」之间的无表头列（V1 新增，TRD §表：保单记录）。
   * DECIMAL 金额字段，经 decimalTransformer 序列化为 number（BE-TYPEORM-03）。 */
  @Column({
    name: 'premium_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  premiumAmount: number | null;

  /** 归属的导入文件记录（V1 新增，TRD §表：保单记录），可空——历史数据/非导入产生的记录为空。
   * 外键→import_file.id（ON DELETE RESTRICT）。 */
  @Column({
    name: 'import_file_id',
    type: 'int',
    nullable: true,
    transformer: numericIdTransformer,
  })
  importFileId: string | null;

  /** 销售人员回填来源：unmatched（未匹配）｜system（第三方接口回填）｜manual（人工补录），
   * 默认 unmatched（V1 新增，TRD §表：保单记录），替代原先仅靠 sales_name 是否为空判断回填状态。 */
  @Column({
    name: 'sales_fill_source',
    type: 'varchar',
    length: 16,
    default: 'unmatched',
  })
  salesFillSource: SalesFillSource;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { numericIdTransformer } from '../common/transformers/numeric-id.transformer';

/**
 * 导出记录：一次提成报表导出的归档信息（V1 新表，TRD §表：导出记录）。只增不改不删。
 * `batchId` 对应 BIGINT 外键列，声明为 string 并经 numericIdTransformer（BE-TYPEORM-02）；
 * 外键约束（batch_id → commission_batch.id，ON DELETE RESTRICT）在 migration 中落地。
 */
@Entity('export_record')
export class ExportRecord {
  @PrimaryColumn({
    type: 'int',
    generated: 'increment',
    transformer: numericIdTransformer,
  })
  id: string;

  @Index()
  @Column({
    name: 'batch_id',
    type: 'bigint',
    transformer: numericIdTransformer,
  })
  batchId: string;

  /** OSS 对象 key，用于经 OssClient 生成签名 URL 下载导出文件 */
  @Column({ name: 'oss_key', type: 'varchar', length: 512 })
  ossKey: string;

  @Column({ name: 'exported_at', type: 'datetime' })
  exportedAt: Date;
}

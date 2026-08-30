import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { numericIdTransformer } from '../common/transformers/numeric-id.transformer';

/**
 * 导入文件记录：一次账单 Excel 导入的归档信息（V1 新表，TRD §表：导入文件记录）。
 * `batchId` 对应 BIGINT 外键列，声明为 string 并经 numericIdTransformer（BE-TYPEORM-02）；
 * 外键约束（batch_id → commission_batch.id，ON DELETE RESTRICT）在 migration 中落地。
 */
@Entity('import_file')
export class ImportFile {
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

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  /** OSS 对象 key，用于经 OssClient 生成签名 URL 下载原始文件 */
  @Column({ name: 'oss_key', type: 'varchar', length: 512 })
  ossKey: string;

  @Column({ name: 'imported_at', type: 'datetime' })
  importedAt: Date;

  @Column({ name: 'success_count', type: 'int' })
  successCount: number;

  @Column({ name: 'fail_count', type: 'int' })
  failCount: number;

  /**
   * 失败行清单 {row, reason}[]（ic-b-010，可空 JSON 列，本任务上线前产生的历史记录为
   * null）。JSON 列运行时类型不可信（BE-JSON-01），读取处须做类型守卫，
   * 见 import.service.ts `toFailReasonsDto()`；本 Entity 仅声明列类型，不做校验。
   */
  @Column({ name: 'fail_reasons', type: 'json', nullable: true })
  failReasons: unknown;
}

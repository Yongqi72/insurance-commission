import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CommissionBatch } from '../commission-batch/commission-batch.entity';
import { ExportRecord } from './export-record.entity';

/**
 * AC3（BE-TYPEORM-02）：export_record.batch_id 为 BIGINT 外键列，字段声明为 string
 * 并经 numericIdTransformer；export_record.id（int 主键）经 numericIdTransformer。
 * commission_batch.id 为 bigint 自增主键，sqlite 建表限制同 commission-batch.entity.spec.ts，
 * 沿用手写建表 SQL 绕过（见该文件注释）。
 */
describe('ExportRecord entity 类型正确性', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [CommissionBatch, ExportRecord],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.query(`
      CREATE TABLE "commission_batch" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "name" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'doing',
        "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await dataSource.query(`
      CREATE TABLE "export_record" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "batch_id" bigint NOT NULL,
        "oss_key" varchar(512) NOT NULL,
        "exported_at" datetime NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('ExportRecord.batchId 保存后重新查询为 string，与来源 CommissionBatch.id 一致', async () => {
    const batchRepo = dataSource.getRepository(CommissionBatch);
    const batch = await batchRepo.save(
      batchRepo.create({ name: '导出批次', status: 'done' }),
    );

    const exportRepo = dataSource.getRepository(ExportRecord);
    const saved = await exportRepo.save(
      exportRepo.create({
        batchId: batch.id,
        ossKey: 'exports/2026-08/report.xlsx',
        exportedAt: new Date(),
      }),
    );

    expect(typeof saved.id).toBe('string');
    expect(typeof saved.batchId).toBe('string');
    expect(saved.batchId).toBe(batch.id);

    const found = await exportRepo.findOneByOrFail({ id: saved.id });
    expect(typeof found.batchId).toBe('string');
    expect(found.batchId).toBe(batch.id);
    expect(Number.isNaN(Number(found.batchId))).toBe(false);
  });
});

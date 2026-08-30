import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CommissionBatch } from './commission-batch.entity';
import { ImportFile } from './import-file.entity';

/**
 * AC3（BE-TYPEORM-02）：commission_batch.id / import_file.batch_id 对应 BIGINT 列，
 * 字段声明为 string 并经 numericIdTransformer；save 后重新查询，取到的类型与断言一致，
 * 不出现 NaN 或 number/string 类型漂移。
 *
 * commission_batch.id 为 BIGINT 自增主键：SQLite 的 AUTOINCREMENT 只允许出现在
 * `INTEGER PRIMARY KEY` 上（见 numeric-id.transformer.ts 注释），用 `synchronize: true`
 * 直接对 bigint 类型主键建表会在 sqlite 驱动下报错。本测试改用 `synchronize: false` +
 * 手写建表 SQL（物理列类型对 sqlite 的动态类型系统无影响，只需列名与 Entity 映射一致），
 * 单纯验证 TypeORM 层的 transformer 读写行为，不依赖 sqlite 对 bigint 主键的支持——
 * 真实 MySQL 环境下 BIGINT AUTO_INCREMENT 主键无此限制，migration 按 MySQL 语法建表
 * （见 src/migrations/*-CreateCommissionTablesAndAlterPolicyRecord.ts）。
 */
describe('CommissionBatch / ImportFile entity 类型正确性', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [CommissionBatch, ImportFile],
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
      CREATE TABLE "import_file" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "batch_id" bigint NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "oss_key" varchar(512) NOT NULL,
        "imported_at" datetime NOT NULL,
        "success_count" int NOT NULL,
        "fail_count" int NOT NULL,
        "fail_reasons" json
      )
    `);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('CommissionBatch.id 保存后重新查询为 string，非 number/NaN', async () => {
    const repo = dataSource.getRepository(CommissionBatch);
    const saved = await repo.save(
      repo.create({ name: '2026-08 批次', status: 'doing' }),
    );

    expect(typeof saved.id).toBe('string');
    expect(Number.isNaN(Number(saved.id))).toBe(false);

    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(typeof found.id).toBe('string');
    expect(found.id).toBe(saved.id);
    expect(found.name).toBe('2026-08 批次');
    expect(found.status).toBe('doing');
  });

  it('ImportFile.batchId（BIGINT 外键列）保存后重新查询为 string', async () => {
    const batchRepo = dataSource.getRepository(CommissionBatch);
    const batch = await batchRepo.save(
      batchRepo.create({ name: '关联批次', status: 'doing' }),
    );

    const importFileRepo = dataSource.getRepository(ImportFile);
    const saved = await importFileRepo.save(
      importFileRepo.create({
        batchId: batch.id,
        fileName: 'bill-2026-08.xlsx',
        ossKey: 'imports/2026-08/bill.xlsx',
        importedAt: new Date(),
        successCount: 100,
        failCount: 3,
      }),
    );

    expect(typeof saved.batchId).toBe('string');
    expect(saved.batchId).toBe(batch.id);

    const found = await importFileRepo.findOneByOrFail({ id: saved.id });
    expect(typeof found.batchId).toBe('string');
    expect(found.batchId).toBe(batch.id);
    expect(Number.isNaN(Number(found.batchId))).toBe(false);
  });
});

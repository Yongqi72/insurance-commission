import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CommissionBatch } from '../commission-batch/commission-batch.entity';
import { ImportFile } from '../commission-batch/import-file.entity';
import { PolicyRecord } from './policy-record.entity';

/**
 * AC3：policy_record V1 新增字段类型正确性——
 * premiumAmount（DECIMAL，BE-TYPEORM-03，经 decimalTransformer 序列化为 number）、
 * importFileId（int，经 numericIdTransformer 序列化为 string，可空）、
 * salesFillSource（varchar 枚举，默认 unmatched）。
 * policy_record 主键为 int（非 bigint），可直接 synchronize:true 建表验证。
 */
describe('PolicyRecord entity V1 新增字段类型正确性', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [PolicyRecord, CommissionBatch, ImportFile],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('premiumAmount 保存后重新查询为 number，非 NaN/string 漂移', async () => {
    const repo = dataSource.getRepository(PolicyRecord);
    const saved = await repo.save(
      repo.create({
        customerName: '客户 A',
        workOrderNo: 'WO-0001',
        businessType: '车险',
        currency: 'CNY',
        policyholder: '投保人 A',
        insuredAmount: 100000,
        premiumAmount: 1234.56,
        policyNo: 'PN-0001',
      }),
    );

    expect(typeof saved.premiumAmount).toBe('number');

    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(typeof found.premiumAmount).toBe('number');
    expect(found.premiumAmount).toBe(1234.56);
    expect(Number.isNaN(found.premiumAmount as number)).toBe(false);
  });

  it('premiumAmount 未提供时可空，importFileId 为 int 外键经 numericIdTransformer 序列化为 string', async () => {
    // import_file_id 现由 @ManyToOne+@JoinColumn 声明为真实外键（本次评估落地，
    // backlog.md 2026-08-27 条目 2026-08-30 更新）：better-sqlite3 驱动默认开启
    // PRAGMA foreign_keys=ON（TypeORM BetterSqlite3Driver.createDatabaseConnection()
    // 固定行为，见该类源码），synchronize 建表会生成真实 FK 约束，引用不存在的 id
    // 会被拒绝——需先落一条真实 ImportFile 记录，取其真实 id，而非像改动前那样
    // 可以随意填一个不存在的占位值 '7'。
    const importFileRepo = dataSource.getRepository(ImportFile);
    const savedImportFile = await importFileRepo.save(
      importFileRepo.create({
        batchId: '1',
        fileName: 'bill.xlsx',
        ossKey: 'bill/import/2026/202608/20260829/bill.xlsx',
        importedAt: new Date(),
        successCount: 1,
        failCount: 0,
      }),
    );

    const repo = dataSource.getRepository(PolicyRecord);
    const saved = await repo.save(
      repo.create({
        customerName: '客户 B',
        workOrderNo: 'WO-0002',
        businessType: '车险',
        currency: 'CNY',
        policyholder: '投保人 B',
        insuredAmount: 50000,
        policyNo: 'PN-0002',
        importFileId: savedImportFile.id,
      }),
    );

    expect(saved.premiumAmount).toBeNull();
    expect(typeof saved.importFileId).toBe('string');
    expect(saved.importFileId).toBe(savedImportFile.id);

    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.premiumAmount).toBeNull();
    expect(typeof found.importFileId).toBe('string');
    expect(found.importFileId).toBe(savedImportFile.id);
  });

  it('salesFillSource 未显式赋值时默认 unmatched', async () => {
    const repo = dataSource.getRepository(PolicyRecord);
    const saved = await repo.save(
      repo.create({
        customerName: '客户 C',
        workOrderNo: 'WO-0003',
        businessType: '车险',
        currency: 'CNY',
        policyholder: '投保人 C',
        insuredAmount: 20000,
        policyNo: 'PN-0003',
      }),
    );

    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.salesFillSource).toBe('unmatched');
  });

  it('work_order_no/policy_no 不再唯一：允许同一工作单号对应多条保单', async () => {
    const repo = dataSource.getRepository(PolicyRecord);
    await repo.save(
      repo.create({
        customerName: '客户 D1',
        workOrderNo: 'WO-DUP',
        businessType: '车险',
        currency: 'CNY',
        policyholder: '投保人 D1',
        insuredAmount: 1000,
        policyNo: 'PN-D1',
      }),
    );

    await expect(
      repo.save(
        repo.create({
          customerName: '客户 D2',
          workOrderNo: 'WO-DUP',
          businessType: '车险',
          currency: 'CNY',
          policyholder: '投保人 D2',
          insuredAmount: 2000,
          policyNo: 'PN-D2',
        }),
      ),
    ).resolves.toBeDefined();

    const count = await repo.count({ where: { workOrderNo: 'WO-DUP' } });
    expect(count).toBe(2);
  });

  it('importBatchId 引用不存在的 CommissionBatch id 时被 FK 约束拒绝', async () => {
    const repo = dataSource.getRepository(PolicyRecord);

    await expect(
      repo.save(
        repo.create({
          customerName: '客户 E1',
          workOrderNo: 'WO-0004',
          businessType: '车险',
          currency: 'CNY',
          policyholder: '投保人 E1',
          insuredAmount: 1000,
          policyNo: 'PN-0004',
          importBatchId: '999999',
        }),
      ),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('importFileId 引用不存在的 ImportFile id 时被 FK 约束拒绝', async () => {
    const repo = dataSource.getRepository(PolicyRecord);

    await expect(
      repo.save(
        repo.create({
          customerName: '客户 E2',
          workOrderNo: 'WO-0005',
          businessType: '车险',
          currency: 'CNY',
          policyholder: '投保人 E2',
          insuredAmount: 1000,
          policyNo: 'PN-0005',
          importFileId: '999999',
        }),
      ),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it('查询结果不显式 relations 时，commissionBatch/importFile 不作为 own property 出现（不泄漏进响应序列化）', async () => {
    const repo = dataSource.getRepository(PolicyRecord);
    const saved = await repo.save(
      repo.create({
        customerName: '客户 F',
        workOrderNo: 'WO-0006',
        businessType: '车险',
        currency: 'CNY',
        policyholder: '投保人 F',
        insuredAmount: 1000,
        policyNo: 'PN-0006',
      }),
    );

    const found = await repo.findOneByOrFail({ id: saved.id });

    expect(Object.prototype.hasOwnProperty.call(found, 'commissionBatch')).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(found, 'importFile')).toBe(
      false,
    );

    const serialized = JSON.parse(JSON.stringify(found)) as Record<
      string,
      unknown
    >;
    expect(
      Object.prototype.hasOwnProperty.call(serialized, 'commissionBatch'),
    ).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(serialized, 'importFile')).toBe(
      false,
    );
  });
});

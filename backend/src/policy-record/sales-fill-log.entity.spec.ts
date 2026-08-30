import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CommissionBatch } from '../commission-batch/commission-batch.entity';
import { ImportFile } from '../commission-batch/import-file.entity';
import { PolicyRecord } from './policy-record.entity';
import { SalesFillLog } from './sales-fill-log.entity';

/**
 * AC3：sales_fill_log.policy_record_id（int 外键）经 numericIdTransformer 序列化为
 * string；只增不改不删的日志表基本存取行为。
 */
describe('SalesFillLog entity 类型正确性', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [PolicyRecord, SalesFillLog, CommissionBatch, ImportFile],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('policyRecordId 保存后重新查询为 string，与来源 PolicyRecord.id 一致', async () => {
    const policyRepo = dataSource.getRepository(PolicyRecord);
    const record = await policyRepo.save(
      policyRepo.create({
        customerName: '客户 A',
        workOrderNo: 'WO-0001',
        businessType: '车险',
        currency: 'CNY',
        policyholder: '投保人 A',
        insuredAmount: 100000,
        policyNo: 'PN-0001',
      }),
    );

    const logRepo = dataSource.getRepository(SalesFillLog);
    const saved = await logRepo.save(
      logRepo.create({
        policyRecordId: record.id,
        operator: 'admin',
        changedAt: new Date(),
        oldValue: null,
        newValue: '张三',
      }),
    );

    expect(typeof saved.id).toBe('string');
    expect(typeof saved.policyRecordId).toBe('string');
    expect(saved.policyRecordId).toBe(record.id);

    const found = await logRepo.findOneByOrFail({ id: saved.id });
    expect(found.oldValue).toBeNull();
    expect(found.newValue).toBe('张三');
    expect(typeof found.policyRecordId).toBe('string');
  });
});

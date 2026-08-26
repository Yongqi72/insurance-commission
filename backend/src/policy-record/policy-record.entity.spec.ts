import 'reflect-metadata';
import { DataSource } from 'typeorm';
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
      entities: [PolicyRecord],
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
        importFileId: '7',
      }),
    );

    expect(saved.premiumAmount).toBeNull();
    expect(typeof saved.importFileId).toBe('string');
    expect(saved.importFileId).toBe('7');

    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.premiumAmount).toBeNull();
    expect(typeof found.importFileId).toBe('string');
    expect(found.importFileId).toBe('7');
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
});

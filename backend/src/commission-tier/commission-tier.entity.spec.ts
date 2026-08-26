import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CommissionTier } from './commission-tier.entity';
import { CommissionTierChangeLog } from './commission-tier-change-log.entity';

/**
 * AC3（BE-TYPEORM-03 + BE-TYPEORM-02）：commission_tier.unit_price 为 DECIMAL 金额字段，
 * 经 decimalTransformer 序列化为 number；commission_tier_change_log.id 等主键经
 * numericIdTransformer 序列化为 string。二者主键均为 int（非 bigint），可直接
 * synchronize:true 建表验证。
 */
describe('CommissionTier / CommissionTierChangeLog entity 类型正确性', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [CommissionTier, CommissionTierChangeLog],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('CommissionTier.unitPrice 保存后重新查询为 number，非 NaN/string 漂移', async () => {
    const repo = dataSource.getRepository(CommissionTier);
    const saved = await repo.save(
      repo.create({ lowerBound: 0, upperBound: 99, unitPrice: 12.5 }),
    );

    expect(typeof saved.unitPrice).toBe('number');

    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(typeof found.unitPrice).toBe('number');
    expect(found.unitPrice).toBe(12.5);
    expect(Number.isNaN(found.unitPrice)).toBe(false);
    expect(typeof found.id).toBe('string');
  });

  it('CommissionTier.upperBound 可空档位保存/查询后仍为 null', async () => {
    const repo = dataSource.getRepository(CommissionTier);
    const saved = await repo.save(
      repo.create({ lowerBound: 100, upperBound: null, unitPrice: 20 }),
    );

    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.upperBound).toBeNull();
    expect(found.unitPrice).toBe(20);
  });

  it('CommissionTierChangeLog 保存后 id 为 string，快照字段原样存取', async () => {
    const repo = dataSource.getRepository(CommissionTierChangeLog);
    const beforeSnapshot = JSON.stringify({
      lowerBound: 0,
      upperBound: 99,
      unitPrice: 10,
    });
    const afterSnapshot = JSON.stringify({
      lowerBound: 0,
      upperBound: 99,
      unitPrice: 12.5,
    });

    const saved = await repo.save(
      repo.create({
        operationType: 'update',
        operator: 'admin',
        changedAt: new Date(),
        beforeSnapshot,
        afterSnapshot,
      }),
    );

    expect(typeof saved.id).toBe('string');

    const found = await repo.findOneByOrFail({ id: saved.id });
    expect(found.beforeSnapshot).toBe(beforeSnapshot);
    expect(found.afterSnapshot).toBe(afterSnapshot);
    expect(JSON.parse(found.afterSnapshot as string).unitPrice).toBe(12.5);
  });
});

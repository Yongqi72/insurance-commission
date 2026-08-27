import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PolicyRecord } from '../src/policy-record/policy-record.entity';

/**
 * commission-batch 保单记录查询 + 回填 e2e：覆盖 PRD AC-05/AC-06/AC-07（TRD §接口：
 * GET/POST /api/commission-batches/:id/policy-records[/fill]）。
 * 第三方接口本期未配置真实地址（known-risks 已记录，仅验证"未配置→全部未匹配"路径）；
 * 命中/异常/结构不符路径用 jest 直接 mock 全局 fetch 验证（BE-EXT-01 防御性校验）。
 */
describe('commission-batch 保单记录查询 + 回填 (e2e)', () => {
  let app: INestApplication;
  let policyRecordRepository: Repository<PolicyRecord>;
  let token: string;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    policyRecordRepository = moduleFixture.get<Repository<PolicyRecord>>(
      getRepositoryToken(PolicyRecord),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-admin', password: 'e2e-Test-Only-Pwd' });
    token = loginRes.body.data.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    delete process.env.SALES_FILL_API_URL;
    fetchSpy?.mockRestore();
  });

  async function createBatch(name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/commission-batches')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
    return res.body.data.id as string;
  }

  async function createRecord(
    batchId: string,
    overrides: Partial<PolicyRecord> = {},
  ): Promise<PolicyRecord> {
    const record = policyRecordRepository.create({
      customerName: '客户甲',
      workOrderNo: 'WO-0001',
      businessType: '车险',
      currency: 'CNY',
      policyholder: '投保人甲',
      insuredAmount: 100000,
      policyNo: 'PN-0001',
      importBatchId: batchId,
      salesFillSource: 'unmatched',
      salesName: null,
      ...overrides,
    });
    return policyRecordRepository.save(record);
  }

  describe('GET /api/commission-batches/:id/policy-records（AC-05/AC-07）', () => {
    it('未登录访问应返回 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/commission-batches/999999/policy-records',
      );
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });

    it('批次不存在 → 1004', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/commission-batches/999999/policy-records')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1004);
    });

    it('按 batchId 过滤 + 默认按 created_at 升序分页返回', async () => {
      const batchId = await createBatch('明细查询-排序批次');
      const first = await createRecord(batchId, { workOrderNo: 'WO-A' });
      const second = await createRecord(batchId, { workOrderNo: 'WO-B' });
      first.createdAt = new Date(Date.now() - 60_000);
      second.createdAt = new Date();
      await policyRecordRepository.save([first, second]);

      const res = await request(app.getHttpServer())
        .get(`/api/commission-batches/${batchId}/policy-records`)
        .query({ page: 1, pageSize: 20 })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      const workOrderNos = res.body.data.list.map(
        (item: { workOrderNo: string }) => item.workOrderNo,
      );
      expect(workOrderNos).toEqual(['WO-A', 'WO-B']);
    });

    it('结果为空时 data.list 为空数组', async () => {
      const batchId = await createBatch('明细查询-空批次');

      const res = await request(app.getHttpServer())
        .get(`/api/commission-batches/${batchId}/policy-records`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.list).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it('keyword 对工作单号/保单号/客户名称三字段 OR 模糊匹配', async () => {
      const batchId = await createBatch('明细查询-关键词批次');
      await createRecord(batchId, {
        workOrderNo: 'WO2026-001',
        policyNo: 'PN-9001',
        customerName: '张三',
      });
      await createRecord(batchId, {
        workOrderNo: 'WO-OTHER',
        policyNo: 'PN-WO2026-002',
        customerName: '李四',
      });
      await createRecord(batchId, {
        workOrderNo: 'WO-UNRELATED',
        policyNo: 'PN-9003',
        customerName: '王五-WO2026客户',
      });
      await createRecord(batchId, {
        workOrderNo: 'WO-NOMATCH',
        policyNo: 'PN-9004',
        customerName: '赵六',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/commission-batches/${batchId}/policy-records`)
        .query({ keyword: 'WO2026' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(3);
    });

    it('fillStatus 按 sales_fill_source 精确过滤（AC-07）', async () => {
      const batchId = await createBatch('明细查询-回填状态批次');
      await createRecord(batchId, {
        workOrderNo: 'WO-UNMATCHED-1',
        salesFillSource: 'unmatched',
      });
      await createRecord(batchId, {
        workOrderNo: 'WO-UNMATCHED-2',
        salesFillSource: 'unmatched',
      });
      await createRecord(batchId, {
        workOrderNo: 'WO-SYSTEM-1',
        salesFillSource: 'system',
        salesName: '张三',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/commission-batches/${batchId}/policy-records`)
        .query({ fillStatus: 'unmatched' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      for (const item of res.body.data.list) {
        expect(item.salesFillSource).toBe('unmatched');
      }
    });
  });

  describe('POST /api/commission-batches/:id/policy-records/fill（AC-06）', () => {
    it('未登录访问应返回 401', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/commission-batches/999999/policy-records/fill',
      );
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });

    it('批次不存在 → 1004', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/commission-batches/999999/policy-records/fill')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1004);
    });

    it('SALES_FILL_API_URL 未配置 → 全部保持未匹配，返回 200 + 统计，不报错', async () => {
      const batchId = await createBatch('回填-未配置批次');
      for (let i = 0; i < 3; i += 1) {
        await createRecord(batchId, { workOrderNo: `WO-FILL-${i}` });
      }

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({
          code: 0,
          data: { total: 3, matchedCount: 0, unmatchedCount: 3 },
        }),
      );

      const records = await policyRecordRepository.find({
        where: { importBatchId: batchId },
      });
      for (const record of records) {
        expect(record.salesFillSource).toBe('unmatched');
        expect(record.salesName).toBeNull();
      }
    });

    it('批次内无未匹配记录 → 返回全 0 统计，不调用第三方接口', async () => {
      const batchId = await createBatch('回填-无待处理批次');
      fetchSpy = jest.spyOn(global, 'fetch');
      process.env.SALES_FILL_API_URL = 'http://mock-sales-fill.local/lookup';

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        total: 0,
        matchedCount: 0,
        unmatchedCount: 0,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('已是 system/manual 的记录本次不受影响', async () => {
      const batchId = await createBatch('回填-已处理不受影响批次');
      const systemRecord = await createRecord(batchId, {
        workOrderNo: 'WO-SYSTEM',
        salesFillSource: 'system',
        salesName: '系统回填人',
      });
      const manualRecord = await createRecord(batchId, {
        workOrderNo: 'WO-MANUAL',
        salesFillSource: 'manual',
        salesName: '人工补录人',
      });
      await createRecord(batchId, { workOrderNo: 'WO-UNMATCHED' });

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        total: 1,
        matchedCount: 0,
        unmatchedCount: 1,
      });

      const reloadedSystem = await policyRecordRepository.findOne({
        where: { id: systemRecord.id },
      });
      const reloadedManual = await policyRecordRepository.findOne({
        where: { id: manualRecord.id },
      });
      expect(reloadedSystem!.salesName).toBe('系统回填人');
      expect(reloadedManual!.salesName).toBe('人工补录人');
    });

    it('第三方接口有返回且命中映射 → 更新为 system，未命中的保持 unmatched', async () => {
      const batchId = await createBatch('回填-命中批次');
      const matched = await createRecord(batchId, { workOrderNo: 'WO-HIT' });
      const unmatched = await createRecord(batchId, {
        workOrderNo: 'WO-MISS',
      });

      process.env.SALES_FILL_API_URL = 'http://mock-sales-fill.local/lookup';
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ 'WO-HIT': '张三' }),
      } as Response);

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        total: 2,
        matchedCount: 1,
        unmatchedCount: 1,
      });

      const reloadedMatched = await policyRecordRepository.findOne({
        where: { id: matched.id },
      });
      const reloadedUnmatched = await policyRecordRepository.findOne({
        where: { id: unmatched.id },
      });
      expect(reloadedMatched!.salesName).toBe('张三');
      expect(reloadedMatched!.salesFillSource).toBe('system');
      expect(reloadedUnmatched!.salesName).toBeNull();
      expect(reloadedUnmatched!.salesFillSource).toBe('unmatched');
    });

    it('回填等待第三方接口响应期间该记录被并发删除 → 该条按未命中处理，其余记录正常回填，不抛异常', async () => {
      const batchId = await createBatch('回填-并发删除批次');
      const survivor = await createRecord(batchId, {
        workOrderNo: 'WO-SURVIVE',
      });
      const deletedDuringFill = await createRecord(batchId, {
        workOrderNo: 'WO-DELETED',
      });

      process.env.SALES_FILL_API_URL = 'http://mock-sales-fill.local/lookup';
      // 用 fetch mock 的实现体模拟并发时序：fill() 发起第三方调用后，在等待
      // 响应期间，另一个请求（如 deleteImport）把 deletedDuringFill 所属的
      // 导入连同这条记录一起硬删除——等第三方响应回来时，这条记录已经不在
      // 数据库里了。
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => {
        await policyRecordRepository.delete({ id: deletedDuringFill.id });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            'WO-SURVIVE': '张三',
            'WO-DELETED': '李四',
          }),
        } as Response;
      });

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        total: 2,
        matchedCount: 1,
        unmatchedCount: 1,
      });

      const reloadedSurvivor = await policyRecordRepository.findOne({
        where: { id: survivor.id },
      });
      expect(reloadedSurvivor!.salesName).toBe('张三');
      expect(reloadedSurvivor!.salesFillSource).toBe('system');

      const reloadedDeleted = await policyRecordRepository.findOne({
        where: { id: deletedDuringFill.id },
      });
      expect(reloadedDeleted).toBeNull();
    });

    it('第三方接口调用异常 → 不抛错，相关记录保持 unmatched（BE-EXT-01/BE-LOG-01）', async () => {
      const batchId = await createBatch('回填-异常批次');
      await createRecord(batchId, { workOrderNo: 'WO-ERR' });

      process.env.SALES_FILL_API_URL = 'http://mock-sales-fill.local/lookup';
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('network error'));

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        total: 1,
        matchedCount: 0,
        unmatchedCount: 1,
      });
    });

    it('第三方接口返回结构不符预期（非对象）→ 不解构使用，按未命中处理', async () => {
      const batchId = await createBatch('回填-结构异常批次');
      await createRecord(batchId, { workOrderNo: 'WO-MALFORMED' });

      process.env.SALES_FILL_API_URL = 'http://mock-sales-fill.local/lookup';
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ['not', 'an', 'object'],
      } as Response);

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        total: 1,
        matchedCount: 0,
        unmatchedCount: 1,
      });
    });
  });
});

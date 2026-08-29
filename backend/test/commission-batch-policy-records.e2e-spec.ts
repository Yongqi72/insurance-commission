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
    delete process.env.SALES_FILL_API_TOKEN;
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

    it('keyword 含下划线时按字面量匹配，不当作 LIKE 通配符', async () => {
      const batchId = await createBatch('明细查询-下划线关键词批次');
      await createRecord(batchId, {
        workOrderNo: 'WO_2026_001',
        policyNo: 'PN-9101',
        customerName: '张三',
      });
      // 若 "_" 被当成 SQL 通配符（匹配任意单字符），"WO_2026_001" 会误命中这条：
      // "WOX2026X001" 恰好把两处 "_" 都替换成别的单字符，长度与结构完全对应。
      await createRecord(batchId, {
        workOrderNo: 'WOX2026X001',
        policyNo: 'PN-9102',
        customerName: '李四',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/commission-batches/${batchId}/policy-records`)
        .query({ keyword: 'WO_2026_001' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.list[0].workOrderNo).toBe('WO_2026_001');
    });

    it('keyword 含百分号时按字面量匹配，不当作 LIKE 通配符', async () => {
      const batchId = await createBatch('明细查询-百分号关键词批次');
      await createRecord(batchId, {
        workOrderNo: 'WO-100%DONE',
        policyNo: 'PN-9201',
        customerName: '王五',
      });
      await createRecord(batchId, {
        workOrderNo: 'WO-100xDONE',
        policyNo: 'PN-9202',
        customerName: '赵六',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/commission-batches/${batchId}/policy-records`)
        .query({ keyword: '100%DONE' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.list[0].workOrderNo).toBe('WO-100%DONE');
    });

    it('keyword 与 fillStatus 同时传入时按 AND 组合过滤（keyword 命中的记录里再筛 fillStatus）', async () => {
      const batchId = await createBatch('明细查询-关键词加回填状态组合批次');
      await createRecord(batchId, {
        workOrderNo: 'WOCOMBO-001',
        policyNo: 'PN-9301',
        customerName: '组合甲',
        salesFillSource: 'unmatched',
      });
      await createRecord(batchId, {
        workOrderNo: 'WOCOMBO-002',
        policyNo: 'PN-9302',
        customerName: '组合乙',
        salesFillSource: 'system',
        salesName: '张三',
      });
      await createRecord(batchId, {
        workOrderNo: 'WO-NOMATCH-COMBO',
        policyNo: 'PN-9303',
        customerName: '组合丙',
        salesFillSource: 'unmatched',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/commission-batches/${batchId}/policy-records`)
        .query({ keyword: 'WOCOMBO', fillStatus: 'unmatched' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.list[0].workOrderNo).toBe('WOCOMBO-001');
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
          data: {
            total: 3,
            matchedCount: 0,
            unmatchedCount: 3,
            nextAfterId: null,
            hasMore: false,
          },
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
        nextAfterId: null,
        hasMore: false,
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
        nextAfterId: null,
        hasMore: false,
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
        nextAfterId: null,
        hasMore: false,
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

    it('配置 SALES_FILL_API_TOKEN 时第三方调用携带 X-Fill-Token 请求头，未配置时不携带', async () => {
      const batchId = await createBatch('回填-密钥透传批次');
      await createRecord(batchId, { workOrderNo: 'WO-TOKEN' });

      process.env.SALES_FILL_API_URL = 'http://mock-sales-fill.local/lookup';
      process.env.SALES_FILL_API_TOKEN = 'e2e-secret-token';
      let capturedInit: RequestInit | undefined;
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (_url: any, init?: any) => {
          capturedInit = init;
          return {
            ok: true,
            status: 200,
            json: async () => ({ 'WO-TOKEN': '张三' }),
          } as Response;
        });

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(
        (capturedInit?.headers as Record<string, string>)['X-Fill-Token'],
      ).toBe('e2e-secret-token');
      expect(
        (capturedInit?.headers as Record<string, string>)['Content-Type'],
      ).toBe('application/json');

      // 未配置密钥时不携带该请求头，其余行为不变（换新批次保证有未匹配记录可触发第三方调用）
      delete process.env.SALES_FILL_API_TOKEN;
      const batchId2 = await createBatch('回填-未配密钥批次');
      await createRecord(batchId2, { workOrderNo: 'WO-NO-TOKEN' });
      capturedInit = undefined;
      const res2 = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId2}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res2.status).toBe(201);
      expect(
        (capturedInit?.headers as Record<string, string>)['X-Fill-Token'],
      ).toBeUndefined();
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
        nextAfterId: null,
        hasMore: false,
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
        nextAfterId: null,
        hasMore: false,
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
        nextAfterId: null,
        hasMore: false,
      });
    });

    it('limit 分页：单批不足 limit 条时一次处理完，hasMore=false 且 nextAfterId=最后一条 id', async () => {
      const batchId = await createBatch('回填-limit未超批次');
      const r1 = await createRecord(batchId, { workOrderNo: 'WO-L1' });
      const r2 = await createRecord(batchId, { workOrderNo: 'WO-L2' });

      process.env.SALES_FILL_API_URL = 'http://mock-sales-fill.local/lookup';
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ 'WO-L1': '张三', 'WO-L2': '李四' }),
      } as Response);

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        total: 2,
        matchedCount: 2,
        unmatchedCount: 0,
        nextAfterId: r2.id,
        hasMore: false,
      });
      // 只是断言游标是"最后一条"，不依赖具体 id 递增顺序假设
      expect(res.body.data.nextAfterId).not.toBe(r1.id);
    });

    it('limit 分页：分两批处理完全部记录，游标不重叠、不遗漏、不重复调用第三方接口', async () => {
      const batchId = await createBatch('回填-limit分两批');
      const records = [];
      for (let i = 0; i < 5; i += 1) {
        records.push(
          await createRecord(batchId, { workOrderNo: `WO-PAGE-${i}` }),
        );
      }

      process.env.SALES_FILL_API_URL = 'http://mock-sales-fill.local/lookup';
      const calledWorkOrderNos: string[][] = [];
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (_url: any, init?: any) => {
          const body = JSON.parse(init.body) as { workOrderNos: string[] };
          calledWorkOrderNos.push(body.workOrderNos);
          // 只有 WO-PAGE-0/2/4 命中，WO-PAGE-1/3 永远查不到（模拟第三方也无解的记录）
          const mapping: Record<string, string> = {
            'WO-PAGE-0': '张三',
            'WO-PAGE-2': '李四',
            'WO-PAGE-4': '王五',
          };
          return {
            ok: true,
            status: 200,
            json: async () => mapping,
          } as Response;
        });

      // 第一批：limit=3，应处理前 3 条（按 id 升序）
      const res1 = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .query({ limit: 3 })
        .set('Authorization', `Bearer ${token}`);
      expect(res1.status).toBe(201);
      expect(res1.body.data.total).toBe(3);
      expect(res1.body.data.matchedCount).toBe(2); // WO-PAGE-0/2 命中
      expect(res1.body.data.hasMore).toBe(true);
      const cursor1 = res1.body.data.nextAfterId as string;
      expect(cursor1).toBe(records[2].id);

      // 第二批：带上一批游标，应处理剩余 2 条（WO-PAGE-3/4），不重复处理前 3 条
      const res2 = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .query({ limit: 3, afterId: cursor1 })
        .set('Authorization', `Bearer ${token}`);
      expect(res2.status).toBe(201);
      expect(res2.body.data).toEqual({
        total: 2,
        matchedCount: 1, // WO-PAGE-4 命中，WO-PAGE-3 查不到
        unmatchedCount: 1,
        nextAfterId: records[4].id,
        hasMore: false,
      });

      // 两批加起来总共只调用了 2 次第三方接口，且合起来覆盖全部 5 个工作单号、互不重叠
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const allCalledNos = calledWorkOrderNos.flat().sort();
      expect(allCalledNos).toEqual(
        [
          'WO-PAGE-0',
          'WO-PAGE-1',
          'WO-PAGE-2',
          'WO-PAGE-3',
          'WO-PAGE-4',
        ].sort(),
      );

      // 最终库里状态：0/2/4 已回填，1/3 仍未匹配（不会被无限重试，两批就终止了）
      const finalRecords = await policyRecordRepository.find({
        where: { importBatchId: batchId },
        order: { id: 'ASC' },
      });
      expect(
        finalRecords.map((r) => [r.workOrderNo, r.salesFillSource]),
      ).toEqual([
        ['WO-PAGE-0', 'system'],
        ['WO-PAGE-1', 'unmatched'],
        ['WO-PAGE-2', 'system'],
        ['WO-PAGE-3', 'unmatched'],
        ['WO-PAGE-4', 'system'],
      ]);
    });

    it('未传 limit 时忽略 afterId，保持旧行为一次处理全部（向后兼容）', async () => {
      const batchId = await createBatch('回填-未传limit兼容');
      await createRecord(batchId, { workOrderNo: 'WO-COMPAT-1' });
      await createRecord(batchId, { workOrderNo: 'WO-COMPAT-2' });

      const res = await request(app.getHttpServer())
        .post(`/api/commission-batches/${batchId}/policy-records/fill`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        total: 2,
        matchedCount: 0,
        unmatchedCount: 2,
        nextAfterId: null,
        hasMore: false,
      });
    });
  });
});

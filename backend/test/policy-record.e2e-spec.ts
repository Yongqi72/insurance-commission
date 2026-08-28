import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PolicyRecord } from '../src/policy-record/policy-record.entity';

/**
 * 标杆穿透切片 e2e：登录 → 带 token 查保单记录列表 → 验证响应信封 + 分页结构；
 * 以及未登录访问 / 登录失败 / 校验失败三条错误路径，覆盖 SH-API-01/02、SH-AUTH-01。
 * Controller 路径由 `policy-records` 改为 `api/policy-records`
 * （TRD 全篇 `/api/` 前缀约定），路径断言同步更新；并补充人工补录 + 补录历史用例
 * （PRD AC-08/AC-09，TRD §接口：PATCH .../sales-name、GET .../sales-fill-logs）。
 */
describe('标杆穿透切片：登录 + 保单记录列表 (e2e)', () => {
  let app: INestApplication;
  let policyRecordRepository: Repository<PolicyRecord>;
  let token: string;

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

  async function createRecord(
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
      salesFillSource: 'unmatched',
      salesName: null,
      ...overrides,
    });
    return policyRecordRepository.save(record);
  }

  it('未登录访问 /api/policy-records 应返回 401 + 统一错误信封', async () => {
    const res = await request(app.getHttpServer()).get('/api/policy-records');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 1002,
        msg: expect.any(String),
        data: null,
      }),
    );
  });

  it('密码错误应返回 401，不签发 token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-admin', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
    expect(res.body.data).toBeNull();
  });

  it('登录请求体缺字段应返回 400 参数校验失败', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-admin' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('登录成功 → 带 token 查列表 → 返回统一成功信封 + 分页结构', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-admin', password: 'e2e-Test-Only-Pwd' });

    expect(loginRes.status).toBe(201);
    expect(loginRes.body).toEqual(
      expect.objectContaining({
        code: 0,
        msg: 'success',
        data: expect.objectContaining({ accessToken: expect.any(String) }),
      }),
    );

    const freshToken = loginRes.body.data.accessToken as string;

    const listRes = await request(app.getHttpServer())
      .get('/api/policy-records')
      .query({ page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${freshToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual(
      expect.objectContaining({
        code: 0,
        msg: 'success',
        data: expect.objectContaining({
          list: expect.any(Array),
          total: expect.any(Number),
          page: 1,
          pageSize: 20,
        }),
      }),
    );
  });

  it('携带失效 token 访问受保护接口应返回 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/policy-records')
      .set('Authorization', 'Bearer this-is-not-a-valid-jwt');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });

  describe('PATCH /api/policy-records/:id/sales-name（人工补录，PRD AC-08）', () => {
    it('golden：salesName 为空的记录首次补录 → manual + 生成一条日志（旧值 null）', async () => {
      const record = await createRecord({ workOrderNo: 'WO-GOLDEN-01' });

      const res = await request(app.getHttpServer())
        .patch(`/api/policy-records/${record.id}/sales-name`)
        .set('Authorization', `Bearer ${token}`)
        .send({ salesName: '张三' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          code: 0,
          msg: 'success',
          data: expect.objectContaining({
            id: record.id,
            salesName: '张三',
            salesFillSource: 'manual',
          }),
        }),
      );

      const logsRes = await request(app.getHttpServer())
        .get(`/api/policy-records/${record.id}/sales-fill-logs`)
        .set('Authorization', `Bearer ${token}`);
      expect(logsRes.body.data).toEqual([
        expect.objectContaining({
          operator: 'e2e-admin',
          oldValue: null,
          newValue: '张三',
        }),
      ]);
    });

    it('允许对已是 system/manual 状态的记录反复覆盖，每次覆盖都新增一条日志', async () => {
      const record = await createRecord({
        workOrderNo: 'WO-OVERRIDE-01',
        salesName: '李四',
        salesFillSource: 'system',
      });

      const firstRes = await request(app.getHttpServer())
        .patch(`/api/policy-records/${record.id}/sales-name`)
        .set('Authorization', `Bearer ${token}`)
        .send({ salesName: '王五' });
      expect(firstRes.status).toBe(200);
      expect(firstRes.body.data.salesName).toBe('王五');
      expect(firstRes.body.data.salesFillSource).toBe('manual');

      const secondRes = await request(app.getHttpServer())
        .patch(`/api/policy-records/${record.id}/sales-name`)
        .set('Authorization', `Bearer ${token}`)
        .send({ salesName: '赵六' });
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.salesName).toBe('赵六');

      const logsRes = await request(app.getHttpServer())
        .get(`/api/policy-records/${record.id}/sales-fill-logs`)
        .set('Authorization', `Bearer ${token}`);
      // 按 changedAt 倒序：最近一次覆盖排最前
      expect(logsRes.body.data).toEqual([
        expect.objectContaining({ oldValue: '王五', newValue: '赵六' }),
        expect.objectContaining({ oldValue: '李四', newValue: '王五' }),
      ]);
    });

    it('salesName 为空字符串 → 1001', async () => {
      const record = await createRecord({ workOrderNo: 'WO-EMPTY-01' });

      const res = await request(app.getHttpServer())
        .patch(`/api/policy-records/${record.id}/sales-name`)
        .set('Authorization', `Bearer ${token}`)
        .send({ salesName: '' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('记录不存在 → 1004', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/policy-records/999999/sales-name')
        .set('Authorization', `Bearer ${token}`)
        .send({ salesName: '张三' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1004);
    });

    it('未登录访问应返回 401', async () => {
      const record = await createRecord({ workOrderNo: 'WO-AUTH-01' });

      const res = await request(app.getHttpServer())
        .patch(`/api/policy-records/${record.id}/sales-name`)
        .send({ salesName: '张三' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });
  });

  describe('GET /api/policy-records/:id/sales-fill-logs（补录历史，PRD AC-09）', () => {
    it('从未被人工修改过的记录返回空数组', async () => {
      const record = await createRecord({ workOrderNo: 'WO-NOLOG-01' });

      const res = await request(app.getHttpServer())
        .get(`/api/policy-records/${record.id}/sales-fill-logs`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({ code: 0, data: [] }));
    });

    it('记录不存在 → 1004', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/policy-records/999999/sales-fill-logs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1004);
    });
  });
});

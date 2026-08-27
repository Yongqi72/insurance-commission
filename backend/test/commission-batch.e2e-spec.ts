import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CommissionBatch } from '../src/commission-batch/commission-batch.entity';

/**
 * commission-batch 模块 e2e：批次创建/分页列表/详情/状态切换四个接口，
 * 覆盖 PRD AC-01/AC-02/AC-05 的 oracle（含 1001/1004 错误码、分页信封、状态切换无副作用）。
 */
describe('commission-batch 批次管理 (e2e)', () => {
  let app: INestApplication;
  let commissionBatchRepository: Repository<CommissionBatch>;
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

    commissionBatchRepository = moduleFixture.get<Repository<CommissionBatch>>(
      getRepositoryToken(CommissionBatch),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-admin', password: 'e2e-Test-Only-Pwd' });
    token = loginRes.body.data.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (method: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);

  it('未登录访问 POST /api/commission-batches 应返回 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/commission-batches')
      .send({ name: '未登录批次' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });

  it('库中无批次时 GET 列表返回 list=[]、total=0（空态，非报错）', async () => {
    const res = await authed('get', '/api/commission-batches').query({
      page: 1,
      pageSize: 20,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 0,
        msg: 'success',
        data: expect.objectContaining({
          list: [],
          total: 0,
          page: 1,
          pageSize: 20,
        }),
      }),
    );
  });

  it('POST 创建批次 name 为空 → 1001', async () => {
    const res = await authed('post', '/api/commission-batches').send({
      name: '',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('POST 创建批次 name 缺失 → 1001', async () => {
    const res = await authed('post', '/api/commission-batches').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  let firstBatchId: string;

  it('POST 创建批次成功 → 生成新批次，初始状态 doing', async () => {
    const res = await authed('post', '/api/commission-batches').send({
      name: '2026年8月批次',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 0,
        msg: 'success',
        data: expect.objectContaining({
          id: expect.any(String),
          name: '2026年8月批次',
          status: 'doing',
          createdAt: expect.any(String),
        }),
      }),
    );
    firstBatchId = res.body.data.id as string;
  });

  it('同名批次允许重复创建，生成不同 id 的第二条记录', async () => {
    const res = await authed('post', '/api/commission-batches').send({
      name: '2026年8月批次',
    });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data.name).toBe('2026年8月批次');
    expect(res.body.data.id).not.toBe(firstBatchId);
  });

  it('GET /api/commission-batches/:id 详情读取成功', async () => {
    const res = await authed('get', `/api/commission-batches/${firstBatchId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          id: firstBatchId,
          name: '2026年8月批次',
          status: 'doing',
        }),
      }),
    );
  });

  it('GET /api/commission-batches/:id 批次不存在 → 1004', async () => {
    const res = await authed('get', '/api/commission-batches/999999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
  });

  it('GET 列表按 created_at 倒序返回（后创建者排前）', async () => {
    // 直接经仓储写入三条记录并显式赋不同 createdAt，避免依赖真实创建耗时制造时间差（去 flaky 化）。
    const base = Date.now();
    const created: CommissionBatch[] = [];
    for (const [name, offsetMs] of [
      ['排序批次A', 0],
      ['排序批次B', 1000],
      ['排序批次C', 2000],
    ] as const) {
      const entity = commissionBatchRepository.create({
        name,
        status: 'doing',
      });
      const saved = await commissionBatchRepository.save(entity);
      saved.createdAt = new Date(base + offsetMs);
      created.push(await commissionBatchRepository.save(saved));
    }

    const res = await authed('get', '/api/commission-batches').query({
      page: 1,
      pageSize: 100,
    });

    expect(res.status).toBe(200);
    const ids: string[] = res.body.data.list.map(
      (item: { id: string }) => item.id,
    );
    const [idA, idB, idC] = created.map((c) => c.id);
    // 只断言 A/B/C 三者的相对顺序（C 最新排最前），不假设列表中无其他数据。
    expect(ids.indexOf(idC)).toBeLessThan(ids.indexOf(idB));
    expect(ids.indexOf(idB)).toBeLessThan(ids.indexOf(idA));
  });

  it('PATCH 状态 status 非法值 → 1001', async () => {
    const res = await authed(
      'patch',
      `/api/commission-batches/${firstBatchId}/status`,
    ).send({ status: 'invalid-status' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
  });

  it('PATCH 状态批次不存在 → 1004', async () => {
    const res = await authed(
      'patch',
      '/api/commission-batches/999999/status',
    ).send({ status: 'done' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
  });

  it('PATCH 状态 doing → done 切换成功，且总记录数不变（无副作用）', async () => {
    const totalBefore = await commissionBatchRepository.count();

    const res = await authed(
      'patch',
      `/api/commission-batches/${firstBatchId}/status`,
    ).send({ status: 'done' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          id: firstBatchId,
          name: '2026年8月批次',
          status: 'done',
        }),
      }),
    );

    const totalAfter = await commissionBatchRepository.count();
    expect(totalAfter).toBe(totalBefore);

    const getRes = await authed(
      'get',
      `/api/commission-batches/${firstBatchId}`,
    );
    expect(getRes.body.data.status).toBe('done');
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * 标杆穿透切片 e2e：登录 → 带 token 查保单记录列表 → 验证响应信封 + 分页结构；
 * 以及未登录访问 / 登录失败 / 校验失败三条错误路径，覆盖 SH-API-01/02、SH-AUTH-01。
 */
describe('标杆穿透切片：登录 + 保单记录列表 (e2e)', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('未登录访问 /policy-records 应返回 401 + 统一错误信封', async () => {
    const res = await request(app.getHttpServer()).get('/policy-records');

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

    const token = loginRes.body.data.accessToken as string;

    const listRes = await request(app.getHttpServer())
      .get('/policy-records')
      .query({ page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`);

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
    // V0 走骨架无导入功能，表内无数据，验证空态而非真实业务数据
    expect(listRes.body.data.list).toEqual([]);
    expect(listRes.body.data.total).toBe(0);
  });

  it('携带失效 token 访问受保护接口应返回 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/policy-records')
      .set('Authorization', 'Bearer this-is-not-a-valid-jwt');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });
});

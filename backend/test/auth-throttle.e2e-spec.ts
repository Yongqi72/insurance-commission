import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * POST /auth/login 限流防护 e2e（ic-b-022）：验证 60 秒窗口内最多 5 次请求、
 * 超出返回 429，且 @Public() 免鉴权与 ThrottlerGuard 限流两个 Guard 维度互不冲突。
 * 每个用例独立创建 app 实例（而非共用 beforeAll 的单实例）：ThrottlerStorage
 * 是随 app 实例新建的内存态，若跨用例复用同一实例，上一用例耗尽的限流计数会
 * 在 60 秒窗口内污染下一用例，导致后一用例的"前 5 次应放行"断言失败。
 * 不测试"窗口过后自动恢复"（需真实等待 60s，e2e 套件不为此付出耗时代价）——
 * 该行为由 @nestjs/throttler 库自身保证，本测试只验证本仓的接线（wiring）正确。
 */
describe('POST /auth/login 限流防护 (e2e, ic-b-022)', () => {
  let app: INestApplication;

  beforeEach(async () => {
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

  afterEach(async () => {
    await app.close();
  });

  const login = (password: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-admin', password });

  it('同一 IP 连续 6 次请求：前 5 次均正常走到密码校验（401，密码错误），第 6 次返回 429 且不再执行密码比对', async () => {
    const results: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await login('wrong-password');
      results.push(res.status);
    }

    // 前 5 次都应正常进入 authService.login()：账号存在但密码错误 → 401（不是 429）。
    expect(results).toEqual([401, 401, 401, 401, 401]);

    const sixth = await login('wrong-password');
    expect(sixth.status).toBe(429);
    // 走现有 AllExceptionsFilter 统一错误信封（HttpException 未显式映射的状态码 → 1001，
    // 与 do-not 一致：本任务不改动该过滤器的映射逻辑）。
    expect(sixth.body).toEqual(
      expect.objectContaining({
        msg: expect.any(String),
        data: null,
      }),
    );
  });

  it('限流在密码比对之前生效：即使 6 次请求全部使用正确密码，第 6 次仍返回 429 而非 200', async () => {
    const results: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await login('e2e-Test-Only-Pwd');
      results.push(res.status);
    }

    expect(results).toEqual([201, 201, 201, 201, 201]);

    const sixth = await login('e2e-Test-Only-Pwd');
    expect(sixth.status).toBe(429);
  });
});

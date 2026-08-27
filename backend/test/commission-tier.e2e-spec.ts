import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CommissionTierChangeLog } from '../src/commission-tier/commission-tier-change-log.entity';
import { CommissionTier } from '../src/commission-tier/commission-tier.entity';

/**
 * commission-tier 模块 e2e：阶梯档位 CRUD + 冲突/完整性判定 + 变更日志
 * （PRD AC-10~AC-13，含 AC-11 golden example）。
 * 每档独立提交即时生效，且冲突/完整性判定互相牵连，各用例之间用 beforeEach 清空两张表，
 * 保证互不干扰（不采用其余 e2e 文件"顺序累积状态"的写法，因为本模块的断言严重依赖
 * 表内当前全量档位的精确构成）。
 */
describe('commission-tier 阶梯规则管理 (e2e)', () => {
  let app: INestApplication;
  let commissionTierRepository: Repository<CommissionTier>;
  let changeLogRepository: Repository<CommissionTierChangeLog>;
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

    commissionTierRepository = moduleFixture.get<Repository<CommissionTier>>(
      getRepositoryToken(CommissionTier),
    );
    changeLogRepository = moduleFixture.get<
      Repository<CommissionTierChangeLog>
    >(getRepositoryToken(CommissionTierChangeLog));

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-admin', password: 'e2e-Test-Only-Pwd' });
    token = loginRes.body.data.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await changeLogRepository.clear();
    await commissionTierRepository.clear();
  });

  const authed = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);

  describe('鉴权', () => {
    it('未登录访问 GET /api/commission-tiers 应返回 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/commission-tiers',
      );

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });

    it('未登录访问 POST /api/commission-tiers 应返回 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/commission-tiers')
        .send({ lowerBound: 0, upperBound: 50, unitPrice: 2 });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });
  });

  describe('GET /api/commission-tiers（AC-12）', () => {
    it('无任何档位时返回 tiers=[]、ruleComplete=false', async () => {
      const res = await authed('get', '/api/commission-tiers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          code: 0,
          msg: 'success',
          data: { tiers: [], ruleComplete: false },
        }),
      );
    });

    it('有档位但不完整时 ruleComplete=false，按 lowerBound 升序返回', async () => {
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 50,
        upperBound: 100,
        unitPrice: 2.2,
      });
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });

      const res = await authed('get', '/api/commission-tiers');

      expect(res.status).toBe(200);
      expect(res.body.data.ruleComplete).toBe(false);
      expect(
        res.body.data.tiers.map((t: { lowerBound: number }) => t.lowerBound),
      ).toEqual([0, 50]);
    });
  });

  describe('POST /api/commission-tiers（AC-10/AC-11）', () => {
    it('golden AC-10 example：空规则表新增 (0,50]=2 → 201 且立即可查', async () => {
      const res = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({
          code: 0,
          data: expect.objectContaining({
            id: expect.any(String),
            lowerBound: 0,
            upperBound: 50,
            unitPrice: 2,
          }),
        }),
      );

      const listRes = await authed('get', '/api/commission-tiers');
      expect(listRes.body.data.tiers).toHaveLength(1);
    });

    it('upperBound 省略视为"及以上"，允许保存', async () => {
      const res = await authed('post', '/api/commission-tiers').send({
        lowerBound: 100,
        unitPrice: 2.4,
      });

      expect(res.status).toBe(201);
      expect(res.body.data.upperBound).toBeNull();
    });

    it('unitPrice 非正数 → 1001', async () => {
      const res = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 0,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('unitPrice 非数字（字符串）→ 1001，不静默通过', async () => {
      const res = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 'abc',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('lowerBound 缺失 → 1001', async () => {
      const res = await authed('post', '/api/commission-tiers').send({
        upperBound: 50,
        unitPrice: 2,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('lowerBound 为负数 → 1001', async () => {
      const res = await authed('post', '/api/commission-tiers').send({
        lowerBound: -1,
        upperBound: 50,
        unitPrice: 2,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('lowerBound >= upperBound → 1001', async () => {
      const res = await authed('post', '/api/commission-tiers').send({
        lowerBound: 50,
        upperBound: 50,
        unitPrice: 2,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('golden AC-11 example：新增区间与已有档位重叠 → 1005，提示含冲突档位', async () => {
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 50,
        upperBound: 100,
        unitPrice: 2.2,
      });

      const res = await authed('post', '/api/commission-tiers').send({
        lowerBound: 60,
        upperBound: 150,
        unitPrice: 2.4,
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(1005);
      expect(res.body.msg).toEqual(expect.stringContaining('50'));
      expect(res.body.msg).toEqual(expect.stringContaining('100'));
    });

    it('golden AC-11 example（续）：改为新增下限100/上限留空 → 保存成功且 ruleComplete=true', async () => {
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 50,
        upperBound: 100,
        unitPrice: 2.2,
      });

      const createRes = await authed('post', '/api/commission-tiers').send({
        lowerBound: 100,
        unitPrice: 2.4,
      });
      expect(createRes.status).toBe(201);

      const listRes = await authed('get', '/api/commission-tiers');
      expect(listRes.body.data.ruleComplete).toBe(true);
    });

    it('留有空隙（未紧邻）但不重叠 → 允许保存，ruleComplete 仍为 false', async () => {
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });

      const res = await authed('post', '/api/commission-tiers').send({
        lowerBound: 60,
        upperBound: 100,
        unitPrice: 2.2,
      });

      expect(res.status).toBe(201);
      const listRes = await authed('get', '/api/commission-tiers');
      expect(listRes.body.data.ruleComplete).toBe(false);
    });
  });

  describe('PATCH /api/commission-tiers/:id（AC-10/AC-11）', () => {
    it('编辑成功，不与自身产生虚假冲突', async () => {
      const createRes = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });
      const id = createRes.body.data.id as string;

      const res = await authed('patch', `/api/commission-tiers/${id}`).send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2.5,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.unitPrice).toBe(2.5);
    });

    it('编辑后与其他档位重叠 → 1005（排除自身）', async () => {
      const first = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 50,
        upperBound: 100,
        unitPrice: 2.2,
      });

      const res = await authed(
        'patch',
        `/api/commission-tiers/${first.body.data.id}`,
      ).send({ lowerBound: 0, upperBound: 60, unitPrice: 2 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(1005);
    });

    it('档位不存在 → 1004', async () => {
      const res = await authed('patch', '/api/commission-tiers/999999').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1004);
    });

    it('非法请求体 → 1001', async () => {
      const createRes = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });

      const res = await authed(
        'patch',
        `/api/commission-tiers/${createRes.body.data.id}`,
      ).send({ lowerBound: 0, upperBound: 50, unitPrice: -1 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });
  });

  describe('DELETE /api/commission-tiers/:id（AC-10）', () => {
    it('删除成功，无字段校验，立即生效', async () => {
      const createRes = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });
      const id = createRes.body.data.id as string;

      const res = await authed('delete', `/api/commission-tiers/${id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ code: 0, data: null }),
      );

      const listRes = await authed('get', '/api/commission-tiers');
      expect(listRes.body.data.tiers).toHaveLength(0);
    });

    it('删除中间档位产生空隙，不阻止本次操作，且 ruleComplete 变为 false', async () => {
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });
      const middle = await authed('post', '/api/commission-tiers').send({
        lowerBound: 50,
        upperBound: 100,
        unitPrice: 2.2,
      });
      await authed('post', '/api/commission-tiers').send({
        lowerBound: 100,
        unitPrice: 2.4,
      });

      const preCheck = await authed('get', '/api/commission-tiers');
      expect(preCheck.body.data.ruleComplete).toBe(true);

      const res = await authed(
        'delete',
        `/api/commission-tiers/${middle.body.data.id}`,
      );
      expect(res.status).toBe(200);

      const postCheck = await authed('get', '/api/commission-tiers');
      expect(postCheck.body.data.ruleComplete).toBe(false);
      expect(postCheck.body.data.tiers).toHaveLength(2);
    });

    it('档位不存在 → 1004', async () => {
      const res = await authed('delete', '/api/commission-tiers/999999');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1004);
    });
  });

  describe('GET /api/commission-tiers/change-logs（AC-13）', () => {
    it('无任何变更记录时返回空数组', async () => {
      const res = await authed('get', '/api/commission-tiers/change-logs');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('golden：新增一档后又删除该档 → 返回两条记录，最新的(delete)在前', async () => {
      const createRes = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });
      const id = createRes.body.data.id as string;
      await authed('delete', `/api/commission-tiers/${id}`);

      const res = await authed('get', '/api/commission-tiers/change-logs');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({
          operationType: 'delete',
          operator: 'e2e-admin',
          beforeSnapshot: { lowerBound: 0, upperBound: 50, unitPrice: 2 },
          afterSnapshot: null,
        }),
      );
      expect(res.body.data[1]).toEqual(
        expect.objectContaining({
          operationType: 'create',
          operator: 'e2e-admin',
          beforeSnapshot: null,
          afterSnapshot: { lowerBound: 0, upperBound: 50, unitPrice: 2 },
        }),
      );
    });

    it('update 操作的日志同时记录 before/after 快照', async () => {
      const createRes = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });
      const id = createRes.body.data.id as string;

      await authed('patch', `/api/commission-tiers/${id}`).send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2.5,
      });

      const res = await authed('get', '/api/commission-tiers/change-logs');
      const updateLog = res.body.data.find(
        (log: { operationType: string }) => log.operationType === 'update',
      );

      expect(updateLog).toEqual(
        expect.objectContaining({
          beforeSnapshot: { lowerBound: 0, upperBound: 50, unitPrice: 2 },
          afterSnapshot: { lowerBound: 0, upperBound: 50, unitPrice: 2.5 },
        }),
      );
    });
  });

  describe('并发新增（阻断级并发问题修复验证）', () => {
    it('两个几乎同时提交、区间确实重叠的新增请求，最终只有一个成功、另一个明确冲突失败', async () => {
      // A: (0,50]，B: (30,80] —— 二者相互重叠但都不与任何既存档位冲突（此时表为空），
      // 若冲突校验与落库之间没有事务串行化，两者都可能各自读到"表为空、无冲突"的快照
      // 并双双写入，制造出违反"阶梯表不重叠"不变式的重叠数据。
      const [resA, resB] = await Promise.all([
        authed('post', '/api/commission-tiers').send({
          lowerBound: 0,
          upperBound: 50,
          unitPrice: 2,
        }),
        authed('post', '/api/commission-tiers').send({
          lowerBound: 30,
          upperBound: 80,
          unitPrice: 3,
        }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const failedRes = resA.status === 409 ? resA : resB;
      expect(failedRes.body.code).toBe(1005);

      // 落库结果必须恰好一条，且表内不存在互相重叠的两条记录——
      // 不能是"两个都成功、事后才发现数据重叠"。
      const listRes = await authed('get', '/api/commission-tiers');
      expect(listRes.body.data.tiers).toHaveLength(1);
    });

    it('对同一档位几乎同时发起的两个编辑请求，与第三档形成重叠时只有一个成功', async () => {
      const base = await authed('post', '/api/commission-tiers').send({
        lowerBound: 0,
        upperBound: 50,
        unitPrice: 2,
      });
      const other = await authed('post', '/api/commission-tiers').send({
        lowerBound: 100,
        upperBound: 150,
        unitPrice: 2.5,
      });
      const baseId = base.body.data.id as string;
      const otherId = other.body.data.id as string;

      // 两笔编辑的新目标区间都不与"对方原始区间"重叠（各自单独看都能通过校验），
      // 但两个新目标区间彼此重叠——只有正确读到"对方已提交的新值"才能检测出冲突；
      // 若各自读到的是对方的旧快照，两笔都会误判通过并双双落库出重叠数据。
      const [resA, resB] = await Promise.all([
        authed('patch', `/api/commission-tiers/${baseId}`).send({
          lowerBound: 60,
          upperBound: 90,
          unitPrice: 2.2,
        }),
        authed('patch', `/api/commission-tiers/${otherId}`).send({
          lowerBound: 70,
          upperBound: 130,
          unitPrice: 2.6,
        }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      const failedRes = resA.status === 409 ? resA : resB;
      expect(failedRes.body.code).toBe(1005);
    });
  });
});

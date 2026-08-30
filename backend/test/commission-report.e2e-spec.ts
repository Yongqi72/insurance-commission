import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { calcCommission } from '../src/commission-report/calc-commission';
import { ExportRecord } from '../src/commission-report/export-record.entity';
import { CommissionTier } from '../src/commission-tier/commission-tier.entity';
import { OssClient } from '../src/common/oss/oss-client';
import { PolicyRecord } from '../src/policy-record/policy-record.entity';

/**
 * 从 supertest 响应中还原原始二进制 Buffer（xlsx 二进制流响应，非 JSON），
 * 用于校验 commission-report 接口返回的 workbook 内容（PRD AC-15 golden example）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function binaryParser(
  res: any,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk: string) => {
    data += chunk;
  });
  res.on('end', () => {
    callback(null, Buffer.from(data, 'binary'));
  });
}

/** 在 workbook 某个 sheet 中查找与给定值数组完全相等的行（用于免受动态明细行数影响的定位） */
function findRowValues(
  workbook: Workbook,
  sheetName: string,
  target: unknown[],
): boolean {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return false;
  let found = false;
  sheet.eachRow((row) => {
    const values = (row.values as unknown[]).slice(1);
    if (JSON.stringify(values) === JSON.stringify(target)) {
      found = true;
    }
  });
  return found;
}

/**
 * commission-report 模块 e2e：提成汇总（AC-14/AC-16）、报表导出（AC-15）、导出历史（AC-17）、
 * 单一权威 calcCommission() 实现（技术 AC）。
 *
 * 沙箱环境未配置真实阿里云 OSS 凭证，用 overrideProvider 替换 OssClient 为 jest mock
 * （与 commission-batch-import.e2e-spec.ts 同款做法），验证业务流程对其调用方式正确，
 * 不发起真实网络请求。
 *
 * 三个接口的 request 均为空（无请求体/查询参数），故不含 1001 参数校验用例；
 * 均为只读或"生成即归档"的幂等操作，不涉及共享可变状态的并发竞态，故不含并发用例
 * （与 commission-tier 模块的阶梯冲突并发场景不同）。
 */
describe('commission-report 提成汇总与导出 (e2e)', () => {
  let app: INestApplication;
  let policyRecordRepository: Repository<PolicyRecord>;
  let commissionTierRepository: Repository<CommissionTier>;
  let exportRecordRepository: Repository<ExportRecord>;
  let token: string;
  let ossUploadMock: jest.Mock;
  let ossGetSignedUrlMock: jest.Mock;
  let ossDeleteMock: jest.Mock;

  beforeAll(async () => {
    ossUploadMock = jest.fn().mockResolvedValue('mock-oss-key');
    ossGetSignedUrlMock = jest
      .fn()
      .mockResolvedValue('https://mock-oss.example.com/signed-url');
    ossDeleteMock = jest.fn().mockResolvedValue(undefined);
    const mockOssClient = {
      upload: ossUploadMock,
      getSignedUrl: ossGetSignedUrlMock,
      delete: ossDeleteMock,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OssClient)
      .useValue(mockOssClient)
      .compile();

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
    commissionTierRepository = moduleFixture.get<Repository<CommissionTier>>(
      getRepositoryToken(CommissionTier),
    );
    exportRecordRepository = moduleFixture.get<Repository<ExportRecord>>(
      getRepositoryToken(ExportRecord),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'e2e-admin', password: 'e2e-Test-Only-Pwd' });
    token = loginRes.body.data.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    ossUploadMock.mockClear();
    ossGetSignedUrlMock.mockClear();
    ossDeleteMock.mockClear();
    // 阶梯规则表为全局表（不按批次隔离），各用例互相独立地定义自己需要的档位组合，
    // 每个用例开始前先清空，避免上一个用例遗留的档位与本用例新增档位叠加成
    // 意料之外的重叠/不完整状态（同 commission-tier.e2e-spec.ts 的隔离写法）。
    await commissionTierRepository.clear();
  });

  async function createBatch(name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/commission-batches')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
    return res.body.data.id as string;
  }

  async function createTier(
    lowerBound: number,
    upperBound: number | null,
    unitPrice: number,
  ): Promise<void> {
    await commissionTierRepository.save(
      commissionTierRepository.create({ lowerBound, upperBound, unitPrice }),
    );
  }

  async function createRecords(
    batchId: string,
    count: number,
    overrides: Partial<PolicyRecord> = {},
  ): Promise<void> {
    const records = Array.from({ length: count }, (_, index) =>
      policyRecordRepository.create({
        customerName: `客户${index}`,
        workOrderNo: `WO-${index}`,
        businessType: '车险',
        currency: 'CNY',
        policyholder: '投保人甲',
        insuredAmount: 10000,
        premiumAmount: 100,
        policyNo: `PN-${index}`,
        importBatchId: batchId,
        salesFillSource: 'unmatched',
        salesName: null,
        ...overrides,
      }),
    );
    await policyRecordRepository.save(records);
  }

  const authed = (method: 'get' | 'post', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);

  describe('鉴权', () => {
    it('未登录访问 GET .../commission-summary 应返回 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/commission-batches/999999/commission-summary',
      );
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });

    it('未登录访问 GET .../commission-report 应返回 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/commission-batches/999999/commission-report',
      );
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });

    it('未登录访问 GET .../exports 应返回 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/commission-batches/999999/exports',
      );
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1002);
    });
  });

  describe('GET /api/commission-batches/:id/commission-summary（AC-14/AC-16）', () => {
    it('批次不存在 → 1004', async () => {
      const res = await authed(
        'get',
        '/api/commission-batches/999999/commission-summary',
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1004);
    });

    it('阶梯规则不完整 → 200，ruleComplete=false，groups=[]（不算错误）', async () => {
      const batchId = await createBatch('提成汇总测试批次-不完整规则');
      await createRecords(batchId, 20, {
        salesName: '张三',
        salesFillSource: 'system',
      });
      await createTier(0, 50, 2);

      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-summary`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ ruleComplete: false, groups: [] });
    });

    it('golden AC-14 example：常熟投保人下张三 40 条已匹配记录，阶梯 (0,50]=2/(50,100]=2.2 → 提成 80', async () => {
      const batchId = await createBatch('提成汇总测试批次-AC14');
      await createTier(0, 50, 2);
      await createTier(50, 100, 2.2);
      // 末档补齐到 +∞ 才满足 ruleComplete；40 票落在第一档，不影响 golden example 的断言值
      await createTier(100, null, 2.4);
      await createRecords(batchId, 40, {
        policyholder: '常熟',
        salesName: '张三',
        salesFillSource: 'system',
      });

      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-summary`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.ruleComplete).toBe(true);
      const group = res.body.data.groups.find(
        (g: { policyholder: string }) => g.policyholder === '常熟',
      );
      expect(group).toBeDefined();
      expect(group.items).toEqual(
        expect.arrayContaining([
          { salesName: '张三', ticketCount: 40, commission: 80 },
        ]),
      );
    });

    it('AC-16：投保人下全部 10 条记录均为未匹配 → 该投保人仍出现，items=[]，subtotal=0', async () => {
      const batchId = await createBatch('提成汇总测试批次-AC16');
      await createTier(0, 50, 2);
      await createTier(50, 100, 2.2);
      await createTier(100, null, 2.4);
      await createRecords(batchId, 10, {
        policyholder: 'XX保险',
        salesFillSource: 'unmatched',
      });

      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-summary`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.groups).toEqual(
        expect.arrayContaining([
          {
            policyholder: 'XX保险',
            items: [],
            subtotal: 0,
            unmatchedCount: 10,
          },
        ]),
      );
    });

    it('分组内同时存在已匹配与未匹配记录 → unmatchedCount 正确，且不影响已匹配的 items/subtotal', async () => {
      const batchId = await createBatch('提成汇总测试批次-未匹配计数');
      await createTier(0, 50, 2);
      await createTier(50, 100, 2.2);
      await createTier(100, null, 2.4);
      await createRecords(batchId, 3, {
        policyholder: '常熟',
        salesName: '张三',
        salesFillSource: 'system',
      });
      await createRecords(batchId, 2, {
        policyholder: '常熟',
        salesFillSource: 'unmatched',
      });

      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-summary`,
      );

      expect(res.status).toBe(200);
      const group = res.body.data.groups.find(
        (g: { policyholder: string }) => g.policyholder === '常熟',
      );
      expect(group).toEqual({
        policyholder: '常熟',
        items: [{ salesName: '张三', ticketCount: 3, commission: 6 }],
        subtotal: 6,
        unmatchedCount: 2,
      });
    });
  });

  describe('GET /api/commission-batches/:id/commission-report（AC-15）', () => {
    it('批次不存在 → 1004', async () => {
      const res = await authed(
        'get',
        '/api/commission-batches/999999/commission-report',
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1004);
    });

    it('阶梯规则不完整 → 2002，不生成文件、不归档、不落导出记录', async () => {
      const batchId = await createBatch('提成导出测试批次-不完整规则');
      await createRecords(batchId, 5, {
        policyholder: '常熟',
        salesName: '张三',
        salesFillSource: 'system',
      });
      await createTier(0, 50, 2);

      const beforeCount = await exportRecordRepository.count();
      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-report`,
      );

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(2002);
      expect(ossUploadMock).not.toHaveBeenCalled();
      expect(await exportRecordRepository.count()).toBe(beforeCount);
    });

    it('golden AC-15 example：张三"常熟"40票/"太仓"20票 → 各 sheet 销售汇总正确 + 新增一条导出记录', async () => {
      const batchId = await createBatch('提成导出测试批次-AC15');
      await createTier(0, 50, 2);
      await createTier(50, 100, 2.2);
      // 末档补齐到 +∞ 才满足 ruleComplete；两组票数均落在第一档，不影响 golden example 的断言值
      await createTier(100, null, 2.4);
      await createRecords(batchId, 40, {
        policyholder: '常熟',
        salesName: '张三',
        salesFillSource: 'system',
      });
      await createRecords(batchId, 20, {
        policyholder: '太仓',
        salesName: '张三',
        salesFillSource: 'manual',
      });

      const beforeCount = await exportRecordRepository.count();
      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-report`,
      )
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(
        decodeURIComponent(res.headers['content-disposition'] as string),
      ).toContain('提成报表.xlsx');

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as Buffer as never);
      expect(workbook.worksheets.map((s) => s.name).sort()).toEqual(
        ['常熟', '太仓'].sort(),
      );
      expect(findRowValues(workbook, '常熟', ['张三', 40, 80])).toBe(true);
      expect(findRowValues(workbook, '太仓', ['张三', 20, 40])).toBe(true);

      expect(ossUploadMock).toHaveBeenCalledTimes(1);
      // ic-b-001 起 ossKey 改为按日期分层归档（bill/export/yyyy/yyyyMM/yyyyMMdd/...），不再含 batchId
      expect(ossUploadMock.mock.calls[0][1] as string).toMatch(
        /^bill\/export\/\d{4}\/\d{6}\/\d{8}\//,
      );
      expect(await exportRecordRepository.count()).toBe(beforeCount + 1);
    });

    it('exportRecordRepository.save() 失败时清理刚上传的孤儿 OSS 对象，且原始错误仍向上抛出', async () => {
      const batchId = await createBatch('提成导出测试批次-孤儿对象清理');
      await createTier(0, 50, 2);
      await createTier(50, null, 2.2);
      await createRecords(batchId, 10, {
        salesName: '张三',
        salesFillSource: 'system',
      });

      const saveError = new Error('模拟落库失败');
      const saveSpy = jest
        .spyOn(exportRecordRepository, 'save')
        .mockRejectedValueOnce(saveError);

      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-report`,
      );

      expect(res.status).toBe(500);
      expect(ossUploadMock).toHaveBeenCalledTimes(1);
      const uploadedKey = ossUploadMock.mock.calls[0][1] as string;
      expect(ossDeleteMock).toHaveBeenCalledTimes(1);
      expect(ossDeleteMock.mock.calls[0][0]).toBe(uploadedKey);

      saveSpy.mockRestore();
    });

    it('AC-16：未匹配记录明细行仍展示（销售列留空），销售汇总表为空表+合计0', async () => {
      const batchId = await createBatch('提成导出测试批次-AC16');
      await createTier(0, 50, 2);
      await createTier(50, 100, 2.2);
      await createTier(100, null, 2.4);
      await createRecords(batchId, 10, {
        policyholder: 'XX保险',
        salesFillSource: 'unmatched',
      });

      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-report`,
      )
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as Buffer as never);
      const sheet = workbook.getWorksheet('XX保险');
      expect(sheet).toBeDefined();
      if (!sheet) return;

      // 明细行仍有 10 行数据（表头 + 10 行），销售列（第 6 列）留空
      const detailRow = sheet.getRow(2).values as unknown[];
      expect(detailRow[6]).toBeFalsy();

      // 销售汇总表在空的已匹配汇总行之后追加一行未匹配统计
      expect(findRowValues(workbook, 'XX保险', ['未匹配', 10, 0])).toBe(true);

      // 合计行：总票数 0、总提成 0（销售汇总表为空，未匹配不计入合计）
      expect(findRowValues(workbook, 'XX保险', ['合计', 0, 0])).toBe(true);
    });

    it('分组内同时存在已匹配与未匹配记录 → 导出的销售汇总表在已匹配行之后追加未匹配行，合计行口径不变', async () => {
      const batchId = await createBatch('提成导出测试批次-未匹配汇总行');
      await createTier(0, 50, 2);
      await createTier(50, 100, 2.2);
      await createTier(100, null, 2.4);
      await createRecords(batchId, 3, {
        policyholder: '常熟',
        salesName: '张三',
        salesFillSource: 'system',
      });
      await createRecords(batchId, 2, {
        policyholder: '常熟',
        salesFillSource: 'unmatched',
      });

      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-report`,
      )
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as Buffer as never);
      const sheet = workbook.getWorksheet('常熟');
      expect(sheet).toBeDefined();
      if (!sheet) return;

      // 已匹配销售行不受影响
      expect(findRowValues(workbook, '常熟', ['张三', 3, 6])).toBe(true);
      // 未匹配统计行
      expect(findRowValues(workbook, '常熟', ['未匹配', 2, 0])).toBe(true);
      // 合计行只统计已匹配的 3 票/6 元，不把未匹配的 2 票折进去
      expect(findRowValues(workbook, '常熟', ['合计', 3, 6])).toBe(true);
    });
  });

  describe('GET /api/commission-batches/:id/exports（AC-17）', () => {
    it('批次不存在 → 1004', async () => {
      const res = await authed('get', '/api/commission-batches/999999/exports');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(1004);
    });

    it('无导出记录时返回空数组', async () => {
      const batchId = await createBatch('导出历史测试批次-空');
      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/exports`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('导出后可在历史中查到该条记录，含现生成的签名 URL，按 exportedAt 倒序', async () => {
      const batchId = await createBatch('导出历史测试批次-有记录');
      await createTier(0, 50, 2);
      await createTier(50, null, 2.4);
      await createRecords(batchId, 5, {
        policyholder: '常熟',
        salesName: '张三',
        salesFillSource: 'system',
      });

      await authed(
        'get',
        `/api/commission-batches/${batchId}/commission-report`,
      )
        .buffer(true)
        .parse(binaryParser);

      const res = await authed(
        'get',
        `/api/commission-batches/${batchId}/exports`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          exportedAt: expect.any(String),
          downloadUrl: 'https://mock-oss.example.com/signed-url',
        }),
      );
      expect(ossGetSignedUrlMock).toHaveBeenCalled();
    });
  });

  describe('calcCommission()（技术 AC：单一权威实现，两接口共用同一份计算）', () => {
    it('区间为左开右闭 (下限,上限]：票数等于上限归入本档，票数等于下限归入前一档', () => {
      const tiers = [
        { lowerBound: 0, upperBound: 50, unitPrice: 2 },
        { lowerBound: 50, upperBound: 100, unitPrice: 2.2 },
      ];
      expect(calcCommission(50, tiers)).toBe(100); // 50 落入 (0,50]
      expect(calcCommission(51, tiers)).toBe(51 * 2.2); // 51 落入 (50,100]
    });

    it('末档 upperBound=null 视为 +∞，覆盖任意大票数', () => {
      const tiers = [
        { lowerBound: 0, upperBound: 100, unitPrice: 2 },
        { lowerBound: 100, upperBound: null, unitPrice: 3 },
      ];
      expect(calcCommission(150, tiers)).toBe(450);
    });

    it('票数落不进任何区间（阶梯不完整/边界之外）时抛错，不静默返回 0', () => {
      const tiers = [{ lowerBound: 0, upperBound: 50, unitPrice: 2 }];
      expect(() => calcCommission(0, tiers)).toThrow();
      expect(() => calcCommission(60, tiers)).toThrow();
    });
  });
});

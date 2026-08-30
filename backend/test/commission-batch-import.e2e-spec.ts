import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ImportFile } from '../src/commission-batch/import-file.entity';
import {
  BILL_SHEET_NAME,
  POLICY_RECORD_COLUMNS,
} from '../src/common/excel/policy-record-columns';
import { OssClient } from '../src/common/oss/oss-client';
import { PolicyRecord } from '../src/policy-record/policy-record.entity';

/** 一行合法数据，8 列顺序对齐 POLICY_RECORD_COLUMNS（与 excel-parser.spec.ts 保持一致口径） */
const VALID_ROW = [
  '客户甲',
  'WO-0001',
  '车险',
  'CNY',
  '投保人甲',
  100000,
  1234.56,
  'PN-0001',
];

async function buildWorkbookBuffer(
  sheetName: string,
  rows: unknown[][],
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(POLICY_RECORD_COLUMNS.map((c) => c.header));
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as unknown as ArrayBuffer);
}

/**
 * commission-batch 导入模块 e2e：上传解析入库归档 / 导入历史 / 撤销导入三个接口，
 * 覆盖 PRD AC-03/AC-04 的 oracle（1001/1004 错误码、failRows 格式、事务级联硬删除）。
 *
 * 沙箱环境未配置真实阿里云 OSS 凭证（.env 无 OSS_* 项，见 oss-client.spec.ts 同款说明），
 * 用 overrideProvider 替换 OssClient 为 jest mock，验证业务流程对其调用方式正确，
 * 不发起真实网络请求；真实 OSS 联调留待部署/联调阶段。
 */
describe('commission-batch 导入 (e2e)', () => {
  let app: INestApplication;
  let importFileRepository: Repository<ImportFile>;
  let policyRecordRepository: Repository<PolicyRecord>;
  let token: string;
  let ossUploadMock: jest.Mock;

  beforeAll(async () => {
    ossUploadMock = jest.fn().mockResolvedValue('mock-oss-key');
    const mockOssClient = {
      upload: ossUploadMock,
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('https://mock-oss.example.com/signed-url'),
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

    importFileRepository = moduleFixture.get<Repository<ImportFile>>(
      getRepositoryToken(ImportFile),
    );
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

  beforeEach(() => {
    ossUploadMock.mockClear();
  });

  async function createBatch(name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/commission-batches')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
    return res.body.data.id as string;
  }

  it('未登录访问 POST .../imports 应返回 401', async () => {
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [VALID_ROW]);
    const res = await request(app.getHttpServer())
      .post('/api/commission-batches/999999/imports')
      .attach('file', buffer, 'bill.xlsx');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1002);
  });

  it('POST 批次不存在 → 1004，且不调用 OSS 上传', async () => {
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [VALID_ROW]);
    const res = await request(app.getHttpServer())
      .post('/api/commission-batches/999999/imports')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'bill.xlsx');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
    expect(ossUploadMock).not.toHaveBeenCalled();
  });

  it('POST 文件无法解析（非 xlsx）→ 1001，OSS 已调用上传但不建导入记录', async () => {
    const batchId = await createBatch('导入-无法解析批次');
    const corruptBuffer = Buffer.from('this is not a valid xlsx file');

    const importCountBefore = await importFileRepository.count();

    const res = await request(app.getHttpServer())
      .post(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', corruptBuffer, 'broken.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
    expect(res.body.msg).toContain('无法解析');
    expect(ossUploadMock).toHaveBeenCalledTimes(1);

    const importCountAfter = await importFileRepository.count();
    expect(importCountAfter).toBe(importCountBefore);
  });

  it('POST 未找到「账单」sheet → 1001，不建导入记录', async () => {
    const batchId = await createBatch('导入-无账单sheet批次');
    const buffer = await buildWorkbookBuffer('其他sheet', [VALID_ROW]);

    const importCountBefore = await importFileRepository.count();

    const res = await request(app.getHttpServer())
      .post(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'bill.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1001);
    expect(res.body.msg).toContain('账单');

    const importCountAfter = await importFileRepository.count();
    expect(importCountAfter).toBe(importCountBefore);
  });

  it('POST 全字段齐全的行 → 成功导入，落库 import_batch_id/import_file_id/sales_fill_source', async () => {
    const batchId = await createBatch('导入-全成功批次');
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      VALID_ROW,
      [
        '客户乙',
        'WO-0002',
        '寿险',
        'CNY',
        '投保人乙',
        200000,
        2345.67,
        'PN-0002',
      ],
    ]);

    const res = await request(app.getHttpServer())
      .post(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, '账单.xlsx');

    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 0,
        msg: 'success',
        data: expect.objectContaining({
          importFileId: expect.any(String),
          fileName: '账单.xlsx',
          successCount: 2,
          failCount: 0,
          failRows: [],
        }),
      }),
    );
    expect(ossUploadMock).toHaveBeenCalledTimes(1);

    const importFileId = res.body.data.importFileId as string;
    const records = await policyRecordRepository.find({
      where: { importFileId },
    });
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.importBatchId).toBe(batchId);
      expect(record.salesFillSource).toBe('unmatched');
    }
  });

  it('POST 部分行字段缺失/金额非数字 → 该行计入 failRows（行号+原因），不影响其余行', async () => {
    const batchId = await createBatch('导入-部分失败批次');
    const rowWithEmptyCustomerName = [...VALID_ROW];
    rowWithEmptyCustomerName[0] = '';
    const rowWithNonNumericInsuredAmount = [...VALID_ROW];
    rowWithNonNumericInsuredAmount[5] = '不是数字';

    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithEmptyCustomerName,
      rowWithNonNumericInsuredAmount,
      VALID_ROW,
    ]);

    const res = await request(app.getHttpServer())
      .post(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, '账单.xlsx');

    expect(res.status).toBe(201);
    expect(res.body.data.successCount).toBe(1);
    expect(res.body.data.failCount).toBe(2);
    expect(res.body.data.failRows).toEqual([
      { row: 2, reason: '「客户名称」不能为空' },
      { row: 3, reason: '「保险金额」必须为数字' },
    ]);

    const importFileId = res.body.data.importFileId as string;
    const records = await policyRecordRepository.find({
      where: { importFileId },
    });
    expect(records).toHaveLength(1);
  });

  it('同一批次可重复上传多份文件', async () => {
    const batchId = await createBatch('导入-重复上传批次');
    const buffer1 = await buildWorkbookBuffer(BILL_SHEET_NAME, [VALID_ROW]);
    const buffer2 = await buildWorkbookBuffer(BILL_SHEET_NAME, [VALID_ROW]);

    const res1 = await request(app.getHttpServer())
      .post(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer1, '账单-1.xlsx');
    const res2 = await request(app.getHttpServer())
      .post(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer2, '账单-2.xlsx');

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.importFileId).not.toBe(res2.body.data.importFileId);

    const imports = await importFileRepository.find({ where: { batchId } });
    expect(imports).toHaveLength(2);
  });

  it('GET .../imports 批次不存在 → 1004', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/commission-batches/999999/imports')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
  });

  it('GET .../imports 无导入记录时返回空数组，非报错', async () => {
    const batchId = await createBatch('导入-空历史批次');

    const res = await request(app.getHttpServer())
      .get(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ code: 0, data: [] }));
  });

  it('GET .../imports 按 imported_at 倒序返回', async () => {
    const batchId = await createBatch('导入-排序批次');
    const buffer1 = await buildWorkbookBuffer(BILL_SHEET_NAME, [VALID_ROW]);
    const buffer2 = await buildWorkbookBuffer(BILL_SHEET_NAME, [VALID_ROW]);

    const res1 = await request(app.getHttpServer())
      .post(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer1, '6月账单.xlsx');
    const res2 = await request(app.getHttpServer())
      .post(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer2, '6月账单-补充.xlsx');

    // 直接改写 imported_at 制造明确时间差，避免依赖同批次两次真实请求间的耗时（去 flaky 化）。
    const first = await importFileRepository.findOne({
      where: { id: res1.body.data.importFileId as string },
    });
    const second = await importFileRepository.findOne({
      where: { id: res2.body.data.importFileId as string },
    });
    first!.importedAt = new Date(Date.now() - 60_000);
    second!.importedAt = new Date();
    await importFileRepository.save(first!);
    await importFileRepository.save(second!);

    const res = await request(app.getHttpServer())
      .get(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const fileNames = res.body.data.map(
      (item: { fileName: string }) => item.fileName,
    );
    expect(fileNames[0]).toBe('6月账单-补充.xlsx');
    expect(fileNames[1]).toBe('6月账单.xlsx');
    // downloadUrl：每条记录都应附带 OssClient.getSignedUrl 生成的签名下载地址（本任务新增字段）。
    (res.body.data as Array<{ downloadUrl: unknown }>).forEach((item) => {
      expect(typeof item.downloadUrl).toBe('string');
      expect((item.downloadUrl as string).length).toBeGreaterThan(0);
    });
  });

  it('DELETE 导入记录不存在 → 1004', async () => {
    const batchId = await createBatch('导入-删除不存在批次');

    const res = await request(app.getHttpServer())
      .delete(`/api/commission-batches/${batchId}/imports/999999`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1004);
  });

  it('DELETE 成功撤销导入：关联保单记录随之消失，导入记录不再出现在列表', async () => {
    const batchId = await createBatch('导入-撤销批次');
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      VALID_ROW,
      [
        '客户丙',
        'WO-0003',
        '车险',
        'CNY',
        '投保人丙',
        300000,
        3456.78,
        'PN-0003',
      ],
    ]);

    const importRes = await request(app.getHttpServer())
      .post(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, '账单.xlsx');
    const importFileId = importRes.body.data.importFileId as string;

    const recordsBefore = await policyRecordRepository.find({
      where: { importFileId },
    });
    expect(recordsBefore).toHaveLength(2);

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/commission-batches/${batchId}/imports/${importFileId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual(
      expect.objectContaining({ code: 0, data: null }),
    );

    const recordsAfter = await policyRecordRepository.find({
      where: { importFileId },
    });
    expect(recordsAfter).toHaveLength(0);

    const importFileAfter = await importFileRepository.findOne({
      where: { id: importFileId },
    });
    expect(importFileAfter).toBeNull();

    const listRes = await request(app.getHttpServer())
      .get(`/api/commission-batches/${batchId}/imports`)
      .set('Authorization', `Bearer ${token}`);
    expect(
      listRes.body.data.some(
        (item: { id: string }) => item.id === importFileId,
      ),
    ).toBe(false);
  });
});

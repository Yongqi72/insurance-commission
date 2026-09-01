import 'reflect-metadata';
import { Workbook } from 'exceljs';
import { ExcelParser } from './excel-parser';
import {
  BILL_SHEET_NAME,
  POLICY_RECORD_COLUMNS,
} from './policy-record-columns';

/** 一行合法数据，8 列顺序对齐 POLICY_RECORD_COLUMNS */
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

describe('ExcelParser（AC5：8 列解析 + 失败行/文件级失败识别）', () => {
  const parser = new ExcelParser();

  it('按 8 列顺序跳过表头逐行解析成功行', async () => {
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [VALID_ROW]);
    const result = await parser.parse(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.failRows).toEqual([]);
    expect(result.successRows).toHaveLength(1);
    expect(result.successRows[0]).toMatchObject({
      rowNumber: 2,
      customerName: '客户甲',
      workOrderNo: 'WO-0001',
      businessType: '车险',
      currency: 'CNY',
      policyholder: '投保人甲',
      insuredAmount: 100000,
      premiumAmount: 1234.56,
      policyNo: 'PN-0001',
    });
  });

  it('任一字段为空的行进入 failRows，不中断其余行处理', async () => {
    const rowWithEmptyCustomerName = [...VALID_ROW];
    rowWithEmptyCustomerName[0] = '';
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithEmptyCustomerName,
      VALID_ROW,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([
      { rowNumber: 2, reason: '「客户名称」不能为空' },
    ]);
    expect(result.successRows).toHaveLength(1);
    expect(result.successRows[0].rowNumber).toBe(3);
  });

  it('保险金额/保费非数字的行进入 failRows，不中断其余行处理', async () => {
    const rowWithNonNumericInsuredAmount = [...VALID_ROW];
    rowWithNonNumericInsuredAmount[5] = '不是数字';
    const rowWithNonNumericPremium = [...VALID_ROW];
    rowWithNonNumericPremium[6] = '也不是数字';

    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithNonNumericInsuredAmount,
      rowWithNonNumericPremium,
      VALID_ROW,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([
      { rowNumber: 2, reason: '「保险金额」必须为数字' },
      { rowNumber: 3, reason: '「保费」必须为数字' },
    ]);
    expect(result.successRows).toHaveLength(1);
    expect(result.successRows[0].rowNumber).toBe(4);
  });

  it('保费为空、其余 7 个字段齐全的行成功导入，落 premiumAmount: null（AC-03）', async () => {
    const rowWithEmptyPremium = [...VALID_ROW];
    rowWithEmptyPremium[6] = '';
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithEmptyPremium,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([]);
    expect(result.successRows).toHaveLength(1);
    expect(result.successRows[0]).toMatchObject({
      rowNumber: 2,
      premiumAmount: null,
    });
  });

  it('保费有值且为数字的行仍成功导入（回归）', async () => {
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [VALID_ROW]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([]);
    expect(result.successRows[0].premiumAmount).toBe(1234.56);
  });

  it('保费有值但非数字的行仍判失败（optional 不豁免数字校验）', async () => {
    const rowWithNonNumericPremium = [...VALID_ROW];
    rowWithNonNumericPremium[6] = '也不是数字';
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithNonNumericPremium,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([
      { rowNumber: 2, reason: '「保费」必须为数字' },
    ]);
    expect(result.successRows).toEqual([]);
  });

  it('保险金额为空的行仍判失败，optional 不泄漏到同为数值列的保险金额', async () => {
    const rowWithEmptyInsuredAmount = [...VALID_ROW];
    rowWithEmptyInsuredAmount[5] = '';
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithEmptyInsuredAmount,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([
      { rowNumber: 2, reason: '「保险金额」不能为空' },
    ]);
    expect(result.successRows).toEqual([]);
  });

  it('保费有值但其他字段（工作单号）为空的行仍判失败，optional 不泄漏到其他列', async () => {
    const rowWithEmptyWorkOrderNo = [...VALID_ROW];
    rowWithEmptyWorkOrderNo[1] = '';
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithEmptyWorkOrderNo,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([
      { rowNumber: 2, reason: '「工作单号」不能为空' },
    ]);
    expect(result.successRows).toEqual([]);
  });

  it('6 个识别字段全空、保费有值（截图 1326 行场景）：整行跳过，不进 successRows/failRows（AC1）', async () => {
    const trailerRow = [...VALID_ROW];
    trailerRow[0] = '';
    trailerRow[1] = '';
    trailerRow[2] = '';
    trailerRow[3] = '';
    trailerRow[4] = '';
    trailerRow[5] = '';
    trailerRow[6] = 339818.02;
    trailerRow[7] = '';
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      trailerRow,
      VALID_ROW,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([]);
    expect(result.successRows).toHaveLength(1);
    expect(result.successRows[0].rowNumber).toBe(3);
  });

  it('6 个识别字段全空、保险金额为非数字非法值：仍判定跳过，不因保险金额非法而变成失败行（AC3）', async () => {
    const trailerRow = [...VALID_ROW];
    trailerRow[0] = '';
    trailerRow[1] = '';
    trailerRow[2] = '';
    trailerRow[3] = '';
    trailerRow[4] = '';
    trailerRow[5] = '不是数字';
    trailerRow[6] = '';
    trailerRow[7] = '';
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [trailerRow]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([]);
    expect(result.successRows).toEqual([]);
  });

  it('6 个识别字段全空、保险金额恰好也填了数字：同样跳过，保险金额有值不影响跳过判断（AC1）', async () => {
    const trailerRow = [...VALID_ROW];
    trailerRow[0] = '';
    trailerRow[1] = '';
    trailerRow[2] = '';
    trailerRow[3] = '';
    trailerRow[4] = '';
    trailerRow[5] = 100;
    trailerRow[6] = '';
    trailerRow[7] = '';
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [trailerRow]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([]);
    expect(result.successRows).toEqual([]);
  });

  it('6 个识别字段中仅客户名称非空、其余（含保险金额/保费）全空：不跳过，按现有逻辑判「工作单号」不能为空（AC2 回归）', async () => {
    const rowWithOnlyCustomerName = ['测试客户', '', '', '', '', '', '', ''];
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithOnlyCustomerName,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([
      { rowNumber: 2, reason: '「工作单号」不能为空' },
    ]);
    expect(result.successRows).toEqual([]);
  });

  it('6 个识别字段仅保单号非空：不跳过，按既有 missingField 优先级仍判「客户名称」不能为空（AC2 回归）', async () => {
    const rowWithOnlyPolicyNo = ['', '', '', '', '', '', '', 'PN-9999'];
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithOnlyPolicyNo,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([
      { rowNumber: 2, reason: '「客户名称」不能为空' },
    ]);
    expect(result.successRows).toEqual([]);
  });

  it('完整合法行不受本次改动影响，仍正常成功导入（回归）', async () => {
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [VALID_ROW]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([]);
    expect(result.successRows).toHaveLength(1);
  });

  it('6 个识别字段全部齐全但保险金额非数字：仍判「保险金额」必须为数字失败，不因新前置检查而被跳过（回归）', async () => {
    const rowWithNonNumericInsuredAmount = [...VALID_ROW];
    rowWithNonNumericInsuredAmount[5] = '不是数字';
    const buffer = await buildWorkbookBuffer(BILL_SHEET_NAME, [
      rowWithNonNumericInsuredAmount,
    ]);

    const result = await parser.parse(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.failRows).toEqual([
      { rowNumber: 2, reason: '「保险金额」必须为数字' },
    ]);
    expect(result.successRows).toEqual([]);
  });

  it('未找到「账单」sheet 时产出 sheet_not_found 文件级失败', async () => {
    const buffer = await buildWorkbookBuffer('其他sheet', [VALID_ROW]);
    const result = await parser.parse(buffer);

    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect(result.reason).toBe('sheet_not_found');
  });

  it('非 Excel / 已损坏文件产出 unreadable 文件级失败，与 sheet_not_found 原因可区分', async () => {
    const corruptBuffer = Buffer.from('this is not a valid xlsx file');
    const result = await parser.parse(corruptBuffer);

    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect(result.reason).toBe('unreadable');
  });

  it('unreadable 与 sheet_not_found 的 msg 文本不同，供上层区分映射', async () => {
    const corruptBuffer = Buffer.from('not xlsx');
    const wrongSheetBuffer = await buildWorkbookBuffer('其他sheet', [
      VALID_ROW,
    ]);

    const unreadableResult = await parser.parse(corruptBuffer);
    const sheetNotFoundResult = await parser.parse(wrongSheetBuffer);

    expect(unreadableResult.ok).toBe(false);
    expect(sheetNotFoundResult.ok).toBe(false);
    if (unreadableResult.ok === true || sheetNotFoundResult.ok === true) {
      return;
    }
    expect(unreadableResult.message).not.toBe(sheetNotFoundResult.message);
  });
});

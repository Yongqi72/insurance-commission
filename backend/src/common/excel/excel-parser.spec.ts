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

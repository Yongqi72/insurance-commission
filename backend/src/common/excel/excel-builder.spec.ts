import 'reflect-metadata';
import { Workbook } from 'exceljs';
import { ExcelBuilder, ExcelBuilderGroup } from './excel-builder';
import { ExcelParser } from './excel-parser';
import {
  BILL_SHEET_NAME,
  POLICY_RECORD_COLUMNS,
} from './policy-record-columns';

describe('ExcelBuilder（AC6：与 ExcelParser 共用同一套列定义 + 多 sheet 生成）', () => {
  const builder = new ExcelBuilder();

  const groups: ExcelBuilderGroup[] = [
    {
      sheetName: '车险',
      detailRows: [
        {
          customerName: '客户甲',
          workOrderNo: 'WO-0001',
          businessType: '车险',
          currency: 'CNY',
          policyholder: '投保人甲',
          insuredAmount: 100000,
          premiumAmount: 1234.56,
          policyNo: 'PN-0001',
        },
      ],
      summaryRows: [
        { salesName: '张三', policyCount: 1, commissionAmount: 50 },
      ],
      totalRow: { policyCount: 1, commissionAmount: 50 },
    },
    {
      sheetName: '寿险',
      detailRows: [],
      summaryRows: [],
      totalRow: { policyCount: 0, commissionAmount: 0 },
    },
  ];

  it('ExcelParser 与 ExcelBuilder 共用 policy-record-columns.ts 的同一个列定义常量', () => {
    // 同一份 import 值：任何一处改列顺序，两边同步生效（不存在第二份硬编码 8 列数组）
    expect(POLICY_RECORD_COLUMNS).toHaveLength(8);
    expect(POLICY_RECORD_COLUMNS.map((c) => c.key)).toEqual([
      'customerName',
      'workOrderNo',
      'businessType',
      'currency',
      'policyholder',
      'insuredAmount',
      'premiumAmount',
      'policyNo',
    ]);
  });

  it('build(groups) 生成的 sheet 数等于分组数', () => {
    const workbook = builder.build(groups);
    expect(workbook.worksheets).toHaveLength(2);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['车险', '寿险']);
  });

  it('每个 sheet 依次包含表头 + 明细行 + 销售汇总行 + 合计行', () => {
    const workbook = builder.build(groups);
    const sheet = workbook.getWorksheet('车险');
    expect(sheet).toBeDefined();
    if (!sheet) return;

    // 表头行：来自共享列定义的 header 文案，顺序与 POLICY_RECORD_COLUMNS 一致
    const headerRow = sheet.getRow(1).values as unknown[];
    expect(headerRow.slice(1)).toEqual(
      POLICY_RECORD_COLUMNS.map((c) => c.header),
    );

    // 明细行
    const detailRow = sheet.getRow(2).values as unknown[];
    expect(detailRow.slice(1)).toEqual([
      '客户甲',
      'WO-0001',
      '车险',
      'CNY',
      '投保人甲',
      100000,
      1234.56,
      'PN-0001',
    ]);

    // 销售汇总标题 + 表头 + 数据行（第 3 行空行分隔，第 4 行标题，第 5 行表头，第 6 行数据）
    expect((sheet.getRow(4).values as unknown[]).slice(1)).toEqual([
      '销售人员提成汇总',
    ]);
    expect((sheet.getRow(6).values as unknown[]).slice(1)).toEqual([
      '张三',
      1,
      50,
    ]);

    // 合计行：第 7 行空行分隔，第 8 行合计
    expect((sheet.getRow(8).values as unknown[]).slice(1)).toEqual([
      '合计',
      1,
      50,
    ]);
  });

  it('toBuffer 生成的 Buffer 可被 exceljs 重新读取（往返一致）', async () => {
    const workbook = builder.build(groups);
    const buffer = await builder.toBuffer(workbook);

    expect(Buffer.isBuffer(buffer)).toBe(true);

    const reloaded = new Workbook();
    await reloaded.xlsx.load(buffer as never);
    expect(reloaded.worksheets).toHaveLength(2);
  });

  it('ExcelBuilder 生成的表头可直接被 ExcelParser 识别为「账单」sheet 并解析（列定义互通）', async () => {
    const singleGroup: ExcelBuilderGroup[] = [
      {
        sheetName: BILL_SHEET_NAME,
        detailRows: groups[0].detailRows,
        summaryRows: [],
        totalRow: { policyCount: 1, commissionAmount: 50 },
      },
    ];
    const workbook = builder.build(singleGroup);
    const buffer = await builder.toBuffer(workbook);

    const parser = new ExcelParser();
    const result = await parser.parse(buffer);

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.successRows).toHaveLength(1);
    expect(result.successRows[0].policyNo).toBe('PN-0001');
  });
});

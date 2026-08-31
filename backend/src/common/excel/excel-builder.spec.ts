import 'reflect-metadata';
import { Workbook } from 'exceljs';
import { ExcelBuilder, ExcelBuilderGroup } from './excel-builder';
import { POLICY_RECORD_COLUMNS } from './policy-record-columns';

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
          salesName: '张三',
          insuredAmount: 100000,
          premiumAmount: 1234.56,
          policyNo: 'PN-0001',
        },
      ],
      summaryRows: [
        {
          salesName: '张三',
          policyCount: 1,
          unitPrice: 50,
          commissionAmount: 50,
        },
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

  it('每个 sheet 依次包含表头（8 列共享账单字段 + 报表专属「销售」列）+ 明细行 + 销售汇总行 + 合计行', () => {
    const workbook = builder.build(groups);
    const sheet = workbook.getWorksheet('车险');
    expect(sheet).toBeDefined();
    if (!sheet) return;

    // 表头行：共享 8 列 header 文案 + 于「投保人」之后插入的「销售」列，顺序为 AC-15 oracle 约定的
    // 客户名称/工作单号/业务类型/币种/投保人/销售/保险金额/保费/保单号
    const headerRow = sheet.getRow(1).values as unknown[];
    expect(headerRow.slice(1)).toEqual([
      '客户名称',
      '工作单号',
      '业务类型',
      '币种',
      '投保人',
      '销售',
      '保险金额',
      '保费',
      '保单号',
    ]);

    // 明细行
    const detailRow = sheet.getRow(2).values as unknown[];
    expect(detailRow.slice(1)).toEqual([
      '客户甲',
      'WO-0001',
      '车险',
      'CNY',
      '投保人甲',
      '张三',
      100000,
      1234.56,
      'PN-0001',
    ]);

    // 销售汇总标题 + 表头 + 数据行（第 3 行空行分隔，第 4 行标题，第 5 行表头，第 6 行数据）
    expect((sheet.getRow(4).values as unknown[]).slice(1)).toEqual([
      '销售人员提成汇总',
    ]);
    // 表头新增「提成单价」列，位于「保单票数」与「提成金额」之间
    expect((sheet.getRow(5).values as unknown[]).slice(1)).toEqual([
      '销售人员',
      '保单票数',
      '提成单价',
      '提成金额',
    ]);
    // 数据行同样在票数与提成金额之间插入 unitPrice
    expect((sheet.getRow(6).values as unknown[]).slice(1)).toEqual([
      '张三',
      1,
      50,
      50,
    ]);

    // 合计行：第 7 行空行分隔，第 8 行合计；单价列留空字符串占位（不填 0），保持 4 列对齐
    expect((sheet.getRow(8).values as unknown[]).slice(1)).toEqual([
      '合计',
      1,
      '',
      50,
    ]);
  });

  it('未匹配统计行与合计行的提成单价列留空字符串占位（不填 0），保持与新表头 4 列对齐', () => {
    const groupWithUnmatched: ExcelBuilderGroup[] = [
      {
        sheetName: '含未匹配',
        detailRows: [],
        summaryRows: [
          {
            salesName: '张三',
            policyCount: 40,
            unitPrice: 2,
            commissionAmount: 80,
          },
        ],
        unmatchedCount: 3,
        totalRow: { policyCount: 40, commissionAmount: 80 },
      },
    ];
    const workbook = builder.build(groupWithUnmatched);
    const sheet = workbook.getWorksheet('含未匹配');
    expect(sheet).toBeDefined();
    if (!sheet) return;

    // detailRows 为空：第 1 行表头（无数据行）、第 2 行空行分隔、第 3 行标题、第 4 行汇总表头、
    // 第 5 行数据、第 6 行未匹配统计行
    expect((sheet.getRow(6).values as unknown[]).slice(1)).toEqual([
      '未匹配',
      3,
      '',
      0,
    ]);
    // 第 7 行空行分隔，第 8 行合计
    expect((sheet.getRow(8).values as unknown[]).slice(1)).toEqual([
      '合计',
      40,
      '',
      80,
    ]);
  });

  it('未匹配明细行的销售列传空字符串，渲染为空白单元格，行本身仍展示', () => {
    const unmatchedGroup: ExcelBuilderGroup[] = [
      {
        sheetName: '未匹配示例',
        detailRows: [
          {
            customerName: '客户乙',
            workOrderNo: 'WO-0002',
            businessType: '车险',
            currency: 'CNY',
            policyholder: '投保人乙',
            salesName: '',
            insuredAmount: 50000,
            premiumAmount: 600,
            policyNo: 'PN-0002',
          },
        ],
        summaryRows: [],
        totalRow: { policyCount: 0, commissionAmount: 0 },
      },
    ];
    const workbook = builder.build(unmatchedGroup);
    const sheet = workbook.getWorksheet('未匹配示例');
    expect(sheet).toBeDefined();
    if (!sheet) return;

    const detailRow = sheet.getRow(2).values as unknown[];
    // exceljs 对空字符串单元格取值为 undefined 或 null（非 undefined 索引的稀疏数组）
    expect(detailRow[6]).toBeFalsy();
  });

  it('toBuffer 生成的 Buffer 可被 exceljs 重新读取（往返一致）', async () => {
    const workbook = builder.build(groups);
    const buffer = await builder.toBuffer(workbook);

    expect(Buffer.isBuffer(buffer)).toBe(true);

    const reloaded = new Workbook();
    await reloaded.xlsx.load(buffer as never);
    expect(reloaded.worksheets).toHaveLength(2);
  });

  // 原「ExcelBuilder 生成的表头可直接被 ExcelParser 识别为账单 sheet 并解析」用例已移除：
  // 报表专属的「销售」列插入后，ExcelBuilder 输出的明细行变为 9 列，不再是 ExcelParser 严格按位置
  // 解析所依赖的 8 列账单形状（BE-EXCEL-01 共享的是 8 列账单字段定义本身，不代表 ExcelBuilder
  // 任意输出都能整体回灌 ExcelParser）；提成报表导出文件本就是终态产物，不存在被重新当账单导入
  // 的业务场景，故不再验证/保留这一往返场景。
});

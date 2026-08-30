/**
 * 保单记录 Excel 列定义：ExcelParser（导入解析「账单」sheet）与 ExcelBuilder（导出生成报表）
 * 唯一共用来源（BE-EXCEL-01）。改一处列顺序/表头，两边同步生效，禁止各自再硬编码一份 8 列数组。
 *
 * 顺序即 TRD 约定的账单 Excel 列顺序：客户名称/工作单号/业务类型/币种/投保人/保险金额/保费/保单号。
 * 导入解析为「跳过表头后按顺序取值」的纯位置解析（不按表头文字匹配）——真实账单文件里「保费」
 * 对应列的表头实际为空白（TRD §表：保单记录：premium_amount 对应「保险金额」与「保单号」之间
 * 的无表头列），故解析端不能依赖 header 文本；`header` 字段仅供 ExcelBuilder 生成报表时作为
 * 可读表头文案使用。
 */
export interface PolicyRecordColumnDef {
  /** 解析结果对象 / PolicyRecord 字段名（camelCase） */
  key: string;
  /** ExcelBuilder 生成报表时使用的表头文案 */
  header: string;
  /** 该列是否为数值列（保险金额/保费）；数值列非数字时该行判为失败行 */
  numeric?: boolean;
  /** 该列是否允许为空；为空时不计入 missingField，落 null 而非判该行失败（当前仅 premiumAmount） */
  optional?: boolean;
}

export const POLICY_RECORD_COLUMNS: readonly PolicyRecordColumnDef[] = [
  { key: 'customerName', header: '客户名称' },
  { key: 'workOrderNo', header: '工作单号' },
  { key: 'businessType', header: '业务类型' },
  { key: 'currency', header: '币种' },
  { key: 'policyholder', header: '投保人' },
  { key: 'insuredAmount', header: '保险金额', numeric: true },
  { key: 'premiumAmount', header: '保费', numeric: true, optional: true },
  { key: 'policyNo', header: '保单号' },
] as const;

/** 「账单」sheet 名（导入解析定位 + 常规单 sheet 导出场景可复用） */
export const BILL_SHEET_NAME = '账单';

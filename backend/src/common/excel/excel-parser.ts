import { Injectable, Logger } from '@nestjs/common';
import { Workbook } from 'exceljs';
import {
  BILL_SHEET_NAME,
  POLICY_RECORD_COLUMNS,
} from './policy-record-columns';

/** 单条解析成功的账单行，字段顺序/命名对齐 policy-record-columns.ts */
export interface PolicyRecordParsedRow {
  /** 原 Excel 行号（含表头，1-based，供失败定位/日志追溯） */
  rowNumber: number;
  customerName: string;
  workOrderNo: string;
  businessType: string;
  currency: string;
  policyholder: string;
  insuredAmount: number;
  premiumAmount: number | null;
  policyNo: string;
}

/** 单条解析失败的账单行 */
export interface PolicyRecordFailRow {
  rowNumber: number;
  reason: string;
}

/** 文件级失败原因：unreadable=文件无法解析（非 Excel/损坏/加密），sheet_not_found=未找到「账单」sheet */
export type ExcelParseFailureReason = 'unreadable' | 'sheet_not_found';

export interface ExcelParseFileFailure {
  ok: false;
  reason: ExcelParseFailureReason;
  message: string;
}

export interface ExcelParseSuccess {
  ok: true;
  successRows: PolicyRecordParsedRow[];
  failRows: PolicyRecordFailRow[];
}

export type ExcelParseResult = ExcelParseSuccess | ExcelParseFileFailure;

const HEADER_ROW_COUNT = 1;

/**
 * 判断"整行跳过"的 6 个识别字段 key：客户名称/工作单号/业务类型/币种/投保人/保单号。
 * 显式不含 insuredAmount/premiumAmount ——数值列不参与"是否跳过整行"的判断。
 */
const ROW_SKIP_CHECK_KEYS: readonly string[] = [
  'customerName',
  'workOrderNo',
  'businessType',
  'currency',
  'policyholder',
  'policyNo',
];

/**
 * 账单 Excel 解析器：读「账单」sheet，跳过表头后按 policy-record-columns.ts 定义的
 * 8 列顺序逐行取值（纯位置解析，不按表头文字匹配，见该文件顶部注释）。
 * 单行失败不中断其余行处理；文件级失败（无法解析 / 未找到「账单」sheet）与行级失败分开表达，
 * 供上层 Controller 分别映射到 TRD 错误码 1001 的不同 msg 文本。
 */
@Injectable()
export class ExcelParser {
  private readonly logger = new Logger(ExcelParser.name);

  async parse(buffer: Buffer): Promise<ExcelParseResult> {
    const workbook = new Workbook();
    try {
      // exceljs 的 .d.ts 在模块内部重声明了与 @types/node 不兼容的本地 Buffer 类型
      // （exceljs 已知类型定义缺陷，运行时两者结构完全兼容），此处窄范围 cast 绕过。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(buffer as any);
    } catch (error) {
      this.logger.warn(`账单 Excel 文件无法解析：${(error as Error).message}`);
      return {
        ok: false,
        reason: 'unreadable',
        message: '文件无法解析，请确认文件为未加密、未损坏的 xlsx 格式',
      };
    }

    const sheet = workbook.getWorksheet(BILL_SHEET_NAME);
    if (!sheet) {
      return {
        ok: false,
        reason: 'sheet_not_found',
        message: `未找到「${BILL_SHEET_NAME}」sheet，请确认文件包含该 sheet 且命名一致`,
      };
    }

    const successRows: PolicyRecordParsedRow[] = [];
    const failRows: PolicyRecordFailRow[] = [];

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= HEADER_ROW_COUNT) {
        return;
      }

      // 尾部合计/说明行前置跳过：6 个识别字段（不含保险金额/保费）同时为空时，
      // 整行既不算成功也不算失败，如同不存在。
      const allIdentifyingFieldsEmpty = POLICY_RECORD_COLUMNS.every(
        (column, index) => {
          if (!ROW_SKIP_CHECK_KEYS.includes(column.key)) {
            return true;
          }
          const raw = ExcelParser.extractCellValue(
            row.getCell(index + 1).value,
          );
          return isEmptyValue(raw);
        },
      );
      if (allIdentifyingFieldsEmpty) {
        return;
      }

      const values: Record<string, unknown> = {};
      let missingField: string | null = null;
      let invalidNumericField: string | null = null;

      POLICY_RECORD_COLUMNS.forEach((column, index) => {
        const cell = row.getCell(index + 1);
        const raw = ExcelParser.extractCellValue(cell.value);

        if (isEmptyValue(raw)) {
          if (column.optional) {
            values[column.key] = null;
            return;
          }
          if (!missingField) {
            missingField = column.header;
          }
          return;
        }

        if (column.numeric) {
          const numericValue = toNumber(raw);
          if (numericValue === null) {
            if (!invalidNumericField) {
              invalidNumericField = column.header;
            }
            return;
          }
          values[column.key] = numericValue;
        } else {
          values[column.key] = String(raw).trim();
        }
      });

      if (missingField) {
        failRows.push({
          rowNumber,
          reason: `「${missingField}」不能为空`,
        });
        return;
      }
      if (invalidNumericField) {
        failRows.push({
          rowNumber,
          reason: `「${invalidNumericField}」必须为数字`,
        });
        return;
      }

      successRows.push({
        rowNumber,
        customerName: values.customerName as string,
        workOrderNo: values.workOrderNo as string,
        businessType: values.businessType as string,
        currency: values.currency as string,
        policyholder: values.policyholder as string,
        insuredAmount: values.insuredAmount as number,
        premiumAmount: values.premiumAmount as number | null,
        policyNo: values.policyNo as string,
      });
    });

    return { ok: true, successRows, failRows };
  }

  /** 展开公式格 result/富文本 richText，取到用于校验/落库的原始值 */
  private static extractCellValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'object') {
      const maybeFormula = value as { result?: unknown; text?: unknown };
      if ('result' in maybeFormula) {
        return maybeFormula.result;
      }
      if ('text' in maybeFormula) {
        return maybeFormula.text;
      }
    }
    return value;
  }
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  return false;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0 || Number.isNaN(Number(trimmed))) {
      return null;
    }
    return Number(trimmed);
  }
  return null;
}

import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { POLICY_RECORD_COLUMNS } from './policy-record-columns';

/**
 * 导出明细行：账单共享 8 列（对齐 policy-record-columns.ts，与 ExcelParser 共用同一份定义）
 * 之外，额外带一列「销售」——该字段来自回填/补录结果，不属于账单导入解析的范围，故不进入
 * ExcelParser 与 ExcelBuilder 共用的 policy-record-columns.ts，仅在导出报表明细行中出现；
 * 未匹配记录该字段传空字符串，渲染为空白单元格，行本身仍展示。
 */
export interface PolicyRecordExportRow {
  customerName: string;
  workOrderNo: string;
  businessType: string;
  currency: string;
  policyholder: string;
  salesName: string;
  insuredAmount: number;
  premiumAmount: number;
  policyNo: string;
}

/** 明细行列定义：在共享的 8 列账单字段基础上，于「投保人」之后插入报表专属的「销售」列 */
const DETAIL_COLUMNS = [
  ...POLICY_RECORD_COLUMNS.slice(0, 5),
  { key: 'salesName', header: '销售' },
  ...POLICY_RECORD_COLUMNS.slice(5),
];

/** 销售人员汇总行：本组内按销售人员小计（提成汇总，由 calcCommission() 计算后传入） */
export interface SalesSummaryRow {
  salesName: string;
  policyCount: number;
  commissionAmount: number;
  segments: Array<{
    lowerBound: number;
    upperBound: number | null;
    ticketCount: number;
    unitPrice: number;
    commission: number;
  }>;
}

/** 合计行：本组全体汇总 */
export interface TotalRow {
  policyCount: number;
  commissionAmount: number;
}

/** 一个分组对应生成 workbook 中的一个 sheet */
export interface ExcelBuilderGroup {
  /** sheet 名称 */
  sheetName: string;
  detailRows: PolicyRecordExportRow[];
  summaryRows: SalesSummaryRow[];
  totalRow: TotalRow;
  /**
   * 本组内未匹配销售人员的记录条数；未传或 <= 0 时不追加未匹配汇总行。
   * 不计入 totalRow 的票数/金额口径（合计仍只统计已匹配销售）。
   */
  unmatchedCount?: number;
}

const DETAIL_HEADER_ROW = 1;
const SUMMARY_SECTION_TITLE = '销售人员提成汇总';
const TOTAL_SECTION_TITLE = '合计';
/** 未匹配汇总行的销售人员列文案；沿用 PolicyRecordTable.vue 界面对 unmatched 记录的既有展示约定。 */
const UNMATCHED_ROW_LABEL = '未匹配';

/**
 * 提成报表 Excel 生成器：明细行的 8 列账单字段与 ExcelParser 共用 policy-record-columns.ts
 * 的同一套定义（BE-EXCEL-01）——改一处列顺序/表头，导入解析与导出生成两边同步生效；
 * 报表专属的「销售」列在此基础上单独插入，不影响该共享定义。
 * build(groups) 按传入分组数据生成多 sheet workbook，每组一个 sheet，sheet 数等于分组数；
 * 每个 sheet 依次包含：明细行（9 列）、销售人员汇总行、合计行。
 */
@Injectable()
export class ExcelBuilder {
  build(groups: ExcelBuilderGroup[]): Workbook {
    const workbook = new Workbook();

    groups.forEach((group) => {
      const sheet = workbook.addWorksheet(group.sheetName);

      // 明细行：表头 + 数据，列顺序/表头文案来自共享列定义（额外插入「销售」列）
      sheet.columns = DETAIL_COLUMNS.map((column) => ({
        header: column.header,
        key: column.key,
        width: 18,
      }));
      group.detailRows.forEach((row) => {
        sheet.addRow(row);
      });

      // 空行分隔
      sheet.addRow([]);

      // 销售人员汇总行
      sheet.addRow([SUMMARY_SECTION_TITLE]);
      sheet.addRow(['销售人员', '档位', '保单票数', '提成单价', '提成金额']);
      group.summaryRows.forEach((row) => {
        row.segments.forEach((segment) => {
          const range =
            segment.upperBound === null
              ? `${segment.lowerBound} 票及以上`
              : `${segment.lowerBound}–${segment.upperBound} 票`;
          sheet.addRow([
            row.salesName,
            range,
            segment.ticketCount,
            segment.unitPrice,
            segment.commission,
          ]);
        });
        sheet.addRow([
          `${row.salesName}小计`,
          '',
          row.policyCount,
          '',
          row.commissionAmount,
        ]);
      });
      // 未匹配统计行：既有 summaryRows 之后、合计行之前追加，仅 unmatchedCount > 0 时展示；
      // 不参与下方 totalRow 的计算（totalRow 仍只统计已匹配销售）。档位和单价列留空。
      if (group.unmatchedCount && group.unmatchedCount > 0) {
        sheet.addRow([UNMATCHED_ROW_LABEL, '', group.unmatchedCount, '', 0]);
      }

      // 合计行：档位和单价列留空；票数和金额直接写数值，不设置 Excel 公式。
      sheet.addRow([]);
      sheet.addRow([
        TOTAL_SECTION_TITLE,
        '',
        group.totalRow.policyCount,
        '',
        group.totalRow.commissionAmount,
      ]);
    });

    return workbook;
  }

  /** 生成 workbook 后序列化为 Buffer，供 OssClient.upload 归档 / HTTP 响应下载 */
  async toBuffer(workbook: Workbook): Promise<Buffer> {
    // exceljs 的 .d.ts 在模块内部重声明了与 @types/node 不兼容的本地 Buffer 类型
    // （exceljs 已知类型定义缺陷，运行时两者结构完全兼容），此处窄范围 cast 绕过。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await workbook.xlsx.writeBuffer();
    return Buffer.from(result as any);
  }
}

// 供测试/上层校验「明细行表头行号固定为第 1 行」这一约定
export const DETAIL_HEADER_ROW_NUMBER = DETAIL_HEADER_ROW;

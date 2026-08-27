import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { POLICY_RECORD_COLUMNS } from './policy-record-columns';

/** 导出明细行：8 列账单字段（对齐 policy-record-columns.ts，与 ExcelParser 共用同一份定义） */
export interface PolicyRecordExportRow {
  customerName: string;
  workOrderNo: string;
  businessType: string;
  currency: string;
  policyholder: string;
  insuredAmount: number;
  premiumAmount: number;
  policyNo: string;
}

/** 销售人员汇总行：本组内按销售人员小计（提成汇总，由 ic-v1-006 的 calcCommission() 计算后传入） */
export interface SalesSummaryRow {
  salesName: string;
  policyCount: number;
  commissionAmount: number;
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
}

const DETAIL_HEADER_ROW = 1;
const SUMMARY_SECTION_TITLE = '销售人员提成汇总';
const TOTAL_SECTION_TITLE = '合计';

/**
 * 提成报表 Excel 生成器：与 ExcelParser 共用 policy-record-columns.ts 的同一套 8 列定义
 * （BE-EXCEL-01）——改一处列顺序/表头，导入解析与导出生成两边同步生效。
 * build(groups) 按传入分组数据生成多 sheet workbook，每组一个 sheet，sheet 数等于分组数；
 * 每个 sheet 依次包含：明细行（8 列）、销售人员汇总行、合计行。
 */
@Injectable()
export class ExcelBuilder {
  build(groups: ExcelBuilderGroup[]): Workbook {
    const workbook = new Workbook();

    groups.forEach((group) => {
      const sheet = workbook.addWorksheet(group.sheetName);

      // 明细行：表头 + 数据，列顺序/表头文案来自共享列定义
      sheet.columns = POLICY_RECORD_COLUMNS.map((column) => ({
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
      sheet.addRow(['销售人员', '保单票数', '提成金额']);
      group.summaryRows.forEach((row) => {
        sheet.addRow([row.salesName, row.policyCount, row.commissionAmount]);
      });

      // 合计行
      sheet.addRow([]);
      sheet.addRow([
        TOTAL_SECTION_TITLE,
        group.totalRow.policyCount,
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

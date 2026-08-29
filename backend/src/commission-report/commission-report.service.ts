import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExcelBuilder,
  ExcelBuilderGroup,
  PolicyRecordExportRow,
} from '../common/excel/excel-builder';
import { OssClient } from '../common/oss/oss-client';
import { buildDatedOssKey } from '../common/oss/oss-key.util';
import { CommissionBatch } from '../commission-batch/commission-batch.entity';
import { ensureBatchExists } from '../commission-batch/ensure-batch-exists.util';
import { CommissionTier } from '../commission-tier/commission-tier.entity';
import { ruleComplete } from '../commission-tier/rule-complete.util';
import { PolicyRecord } from '../policy-record/policy-record.entity';
import { calcCommission } from './calc-commission';
import { ExportRecord } from './export-record.entity';

/** 阶梯规则不完整，无法计算/导出提成（SH-API-02 · 2002）。 */
export class RuleIncompleteException extends HttpException {
  constructor() {
    super('提成阶梯规则不完整，无法生成报表', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export interface CommissionSummaryItemDto {
  salesName: string;
  ticketCount: number;
  commission: number;
}

export interface CommissionSummaryGroupDto {
  policyholder: string;
  items: CommissionSummaryItemDto[];
  subtotal: number;
}

export interface CommissionSummaryResultDto {
  ruleComplete: boolean;
  groups: CommissionSummaryGroupDto[];
}

export interface CommissionReportFileDto {
  buffer: Buffer;
  fileName: string;
}

export interface ExportListItemDto {
  id: string;
  exportedAt: Date;
  downloadUrl: string;
}

/** Excel sheet 名称不允许出现的字符（exceljs/Excel 本身的限制），命中一律替换为下划线 */
const SHEET_NAME_INVALID_CHARS = /[*?:\\/[\]]/g;
/** Excel sheet 名称长度上限 */
const SHEET_NAME_MAX_LENGTH = 31;

/**
 * 提成汇总与导出（TRD §接口：GET .../commission-summary、.../commission-report、
 * .../exports，PRD AC-14~AC-17）。核心计算全部经由 calcCommission()（单一权威实现），
 * 阶梯完整性判定复用提成阶梯规则模块导出的 ruleComplete()，两者均不在本类重复实现。
 * 提成数字现查现算，不做任何计算结果的持久化快照——归档的 export_record 只记录
 * "当次导出的文件在 OSS 的位置"，不记录计算过程或计算结果本身。
 */
@Injectable()
export class CommissionReportService {
  constructor(
    @InjectRepository(CommissionBatch)
    private readonly commissionBatchRepository: Repository<CommissionBatch>,
    @InjectRepository(PolicyRecord)
    private readonly policyRecordRepository: Repository<PolicyRecord>,
    @InjectRepository(CommissionTier)
    private readonly commissionTierRepository: Repository<CommissionTier>,
    @InjectRepository(ExportRecord)
    private readonly exportRecordRepository: Repository<ExportRecord>,
    private readonly excelBuilder: ExcelBuilder,
    private readonly ossClient: OssClient,
  ) {}

  async getSummary(batchId: string): Promise<CommissionSummaryResultDto> {
    await ensureBatchExists(this.commissionBatchRepository, batchId);

    const tiers = await this.loadTiers();
    if (!ruleComplete(tiers)) {
      return { ruleComplete: false, groups: [] };
    }

    // 一次性加载该批次全部记录（含未匹配），组内分组统计全部基于内存数据完成，
    // 不在循环中逐条查库（BE-DB-02）。
    const records = await this.loadBatchRecords(batchId);
    const groups = this.groupByPolicyholder(records).map(
      ({ policyholder, records: groupRecords }) => {
        const items = this.buildSummaryItems(groupRecords, tiers);
        const subtotal = items.reduce((sum, item) => sum + item.commission, 0);
        return { policyholder, items, subtotal };
      },
    );

    return { ruleComplete: true, groups };
  }

  async exportReport(batchId: string): Promise<CommissionReportFileDto> {
    const batch = await ensureBatchExists(
      this.commissionBatchRepository,
      batchId,
    );

    const tiers = await this.loadTiers();
    if (!ruleComplete(tiers)) {
      throw new RuleIncompleteException();
    }

    const records = await this.loadBatchRecords(batchId);
    const usedSheetNames = new Set<string>();
    const excelGroups: ExcelBuilderGroup[] = this.groupByPolicyholder(
      records,
    ).map(({ policyholder, records: groupRecords }) => {
      const items = this.buildSummaryItems(groupRecords, tiers);
      const detailRows: PolicyRecordExportRow[] = groupRecords.map(
        (record) => ({
          customerName: record.customerName,
          workOrderNo: record.workOrderNo,
          businessType: record.businessType,
          currency: record.currency,
          policyholder: record.policyholder,
          salesName:
            record.salesFillSource === 'unmatched'
              ? ''
              : (record.salesName ?? ''),
          insuredAmount: record.insuredAmount,
          premiumAmount: record.premiumAmount ?? 0,
          policyNo: record.policyNo,
        }),
      );

      return {
        sheetName: this.buildUniqueSheetName(policyholder, usedSheetNames),
        detailRows,
        summaryRows: items.map((item) => ({
          salesName: item.salesName,
          policyCount: item.ticketCount,
          commissionAmount: item.commission,
        })),
        totalRow: {
          policyCount: items.reduce((sum, item) => sum + item.ticketCount, 0),
          commissionAmount: items.reduce(
            (sum, item) => sum + item.commission,
            0,
          ),
        },
      };
    });

    const workbook = this.excelBuilder.build(excelGroups);
    const buffer = await this.excelBuilder.toBuffer(workbook);
    const fileName = `${batch.name}-提成报表.xlsx`;

    // 生成的 buffer 先上传归档（BE-EXT-02 统一经 OssClient），再落一条可追溯的导出记录；
    // 提成数字本身不落库，落库的只有「文件归档位置 + 导出时间」。
    const ossKey = buildDatedOssKey('export', fileName);
    await this.ossClient.upload(buffer, ossKey);
    await this.exportRecordRepository.save(
      this.exportRecordRepository.create({
        batchId,
        ossKey,
        exportedAt: new Date(),
      }),
    );

    return { buffer, fileName };
  }

  async listExports(batchId: string): Promise<ExportListItemDto[]> {
    await ensureBatchExists(this.commissionBatchRepository, batchId);

    const exportRecords = await this.exportRecordRepository.find({
      where: { batchId },
      order: { exportedAt: 'DESC' },
    });

    return Promise.all(
      exportRecords.map(async (record) => ({
        id: record.id,
        exportedAt: record.exportedAt,
        downloadUrl: await this.ossClient.getSignedUrl(record.ossKey),
      })),
    );
  }

  private async loadTiers(): Promise<CommissionTier[]> {
    return this.commissionTierRepository.find({
      order: { lowerBound: 'ASC' },
    });
  }

  private async loadBatchRecords(batchId: string): Promise<PolicyRecord[]> {
    return this.policyRecordRepository.find({
      where: { importBatchId: batchId },
      order: { policyholder: 'ASC', id: 'ASC' },
    });
  }

  /** 按投保人分组，保留分组内原始记录顺序；不筛除未匹配记录——该函数供两个接口共用同一份分组结果。 */
  private groupByPolicyholder(
    records: PolicyRecord[],
  ): Array<{ policyholder: string; records: PolicyRecord[] }> {
    const order: string[] = [];
    const grouped = new Map<string, PolicyRecord[]>();
    records.forEach((record) => {
      if (!grouped.has(record.policyholder)) {
        grouped.set(record.policyholder, []);
        order.push(record.policyholder);
      }
      grouped.get(record.policyholder)?.push(record);
    });
    return order.map((policyholder) => ({
      policyholder,
      records: grouped.get(policyholder) ?? [],
    }));
  }

  /**
   * 组内按销售人员统计局部票数并调用 calcCommission()（单一权威实现）算提成。
   * 只统计 sales_fill_source != 'unmatched' 的记录（AC-16）；全部为未匹配时返回空数组。
   */
  private buildSummaryItems(
    records: PolicyRecord[],
    tiers: CommissionTier[],
  ): CommissionSummaryItemDto[] {
    const order: string[] = [];
    const ticketCountBySales = new Map<string, number>();
    records
      .filter((record) => record.salesFillSource !== 'unmatched')
      .forEach((record) => {
        const salesName = record.salesName ?? '';
        if (!ticketCountBySales.has(salesName)) {
          ticketCountBySales.set(salesName, 0);
          order.push(salesName);
        }
        ticketCountBySales.set(
          salesName,
          (ticketCountBySales.get(salesName) ?? 0) + 1,
        );
      });

    return order.map((salesName) => {
      const ticketCount = ticketCountBySales.get(salesName) ?? 0;
      return {
        salesName,
        ticketCount,
        commission: calcCommission(ticketCount, tiers),
      };
    });
  }

  /**
   * 投保人名可能超出 Excel sheet 名称限制（≤31 字符、不含 `*?:\/[]`）或与同批次内另一个
   * 投保人截断后重名；分别做字符清理、长度截断、重名追加序号兜底，避免 exceljs 在
   * addWorksheet() 时直接抛错导致整份报表生成失败。
   */
  private buildUniqueSheetName(
    policyholder: string,
    usedNames: Set<string>,
  ): string {
    const sanitized =
      policyholder.replace(SHEET_NAME_INVALID_CHARS, '_').trim() ||
      '未命名投保人';
    const base = sanitized.slice(0, SHEET_NAME_MAX_LENGTH);

    let candidate = base;
    let suffix = 1;
    while (usedNames.has(candidate)) {
      const suffixText = `~${suffix}`;
      candidate =
        base.slice(0, SHEET_NAME_MAX_LENGTH - suffixText.length) + suffixText;
      suffix += 1;
    }
    usedNames.add(candidate);
    return candidate;
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
import { PageResultDto } from '../common/dto/page-result.dto';
import { PolicyRecord } from '../policy-record/policy-record.entity';
import { CommissionBatch } from './commission-batch.entity';
import { QueryPolicyRecordDto } from './dto/query-policy-record.dto';

/** 第三方回填接口调用超时阈值（TRD §接口：POST .../policy-records/fill，5s） */
const FILL_TIMEOUT_MS = 5000;

export interface FillResultDto {
  total: number;
  matchedCount: number;
  unmatchedCount: number;
}

const KEYWORD_FIELDS: Array<keyof PolicyRecord> = [
  'workOrderNo',
  'policyNo',
  'customerName',
];

/**
 * 批次维度的保单记录查询 + 触发回填（TRD §接口：GET/POST .../policy-records[/fill]，
 * PRD AC-05~AC-07）。与批次 CRUD（commission-batch.service.ts）、导入
 * （import.service.ts）分开的独立 Service 文件，三者并行注册进同一
 * commission-batch.module.ts（见该文件顶部注释）。
 */
@Injectable()
export class PolicyRecordQueryService {
  private readonly logger = new Logger(PolicyRecordQueryService.name);

  constructor(
    @InjectRepository(CommissionBatch)
    private readonly commissionBatchRepository: Repository<CommissionBatch>,
    @InjectRepository(PolicyRecord)
    private readonly policyRecordRepository: Repository<PolicyRecord>,
    private readonly configService: ConfigService,
  ) {}

  async findPage(
    batchId: string,
    query: QueryPolicyRecordDto,
  ): Promise<PageResultDto<PolicyRecord>> {
    await this.ensureBatchExists(batchId);

    const { page, pageSize, keyword, fillStatus } = query;
    const baseWhere: FindOptionsWhere<PolicyRecord> = {
      importBatchId: batchId,
    };
    if (fillStatus) {
      baseWhere.salesFillSource = fillStatus;
    }

    // keyword 对工作单号/保单号/客户名称三字段做 OR 模糊匹配，同时叠加 batchId/fillStatus
    // 过滤——用「同一前缀条件 + 各自字段 Like」的多条 where 对象数组表达 OR（TypeORM 惯例）。
    const where:
      FindOptionsWhere<PolicyRecord> | FindOptionsWhere<PolicyRecord>[] =
      keyword
        ? KEYWORD_FIELDS.map((field) => ({
            ...baseWhere,
            [field]: Like(`%${keyword}%`),
          }))
        : baseWhere;

    const [list, total] = await this.policyRecordRepository.findAndCount({
      where,
      order: { createdAt: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return new PageResultDto(list, total, page, pageSize);
  }

  /**
   * 批量回填骨架（TRD §接口：POST .../policy-records/fill，PRD AC-06）：只对当前仍为
   * unmatched 的记录生效，已是 system/manual 的记录本次不受影响；地址未配置/超时/
   * 调用异常/返回结构不符预期一律按未命中处理，操作本身视为成功完成，不抛错。
   */
  async fill(batchId: string): Promise<FillResultDto> {
    await this.ensureBatchExists(batchId);

    const unmatchedRecords = await this.policyRecordRepository.find({
      where: { importBatchId: batchId, salesFillSource: 'unmatched' },
    });

    const total = unmatchedRecords.length;
    if (total === 0) {
      return { total: 0, matchedCount: 0, unmatchedCount: 0 };
    }

    const apiUrl = this.configService.get<string>('SALES_FILL_API_URL');
    const mapping = apiUrl
      ? await this.callFillApi(
          apiUrl,
          unmatchedRecords.map((record) => record.workOrderNo),
        )
      : undefined;

    // 逐条按 id 条件 UPDATE（而非先取实体整体 save）：在本次回填 await 第三方接口
    // 期间，该批次里的某条记录可能已被并发的删除导入操作（连同其所属 import_file）
    // 硬删除。若沿用「取实体 → save()」的写法，TypeORM 对数据库里已不存在的行会把
    // save() 退化成携带原 id 的 INSERT，而这条记录的 import_file_id 外键已随之
    // 被删，INSERT 会直接违反外键约束抛异常。update() 对不存在的行只会影响 0 行，
    // 不会退化成插入，天然对「记录已被并发删除」免疫。同时用 Promise.allSettled
    // 隔离每条记录的更新结果，避免其中一条异常/受影响 0 行波及同批次其余记录
    // 本该成功落库的回填结果、或让整个请求抛出未处理异常。
    const outcomes = await Promise.allSettled(
      unmatchedRecords.map(async (record) => {
        // BE-EXT-01：第三方返回值必须先校验关键字段非 null/undefined 且类型正确才能使用；
        // 无法识别/未命中的一律保持 unmatched，不把脏值解构进 salesName。
        const name = mapping ? mapping[record.workOrderNo] : undefined;
        if (typeof name !== 'string' || name.trim().length === 0) {
          return false;
        }
        const result = await this.policyRecordRepository.update(
          { id: record.id },
          { salesName: name, salesFillSource: 'system' },
        );
        // affected === 0：这条记录在回填过程中已被并发删除（如所属导入被撤销），
        // 按未命中处理，不计入 matchedCount。
        return (result.affected ?? 0) > 0;
      }),
    );

    let matchedCount = 0;
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        if (outcome.value) {
          matchedCount += 1;
        }
      } else {
        const reason =
          outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason);
        this.logger.error(
          `批量回填过程中单条记录更新失败，按未命中处理：batchId=${batchId}, reason=${reason}`,
          outcome.reason instanceof Error ? outcome.reason.stack : undefined,
        );
      }
    }

    return { total, matchedCount, unmatchedCount: total - matchedCount };
  }

  /**
   * 调用第三方回填接口：超时（5s）/网络异常/HTTP 非成功状态码/返回体非对象结构
   * 一律返回 undefined（按未命中处理），异常经 Logger 记录具体原因，不裸吞（BE-LOG-01）。
   */
  private async callFillApi(
    apiUrl: string,
    workOrderNos: string[],
  ): Promise<Record<string, string> | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FILL_TIMEOUT_MS);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrderNos }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `第三方回填接口返回非成功状态码：url=${apiUrl}, status=${response.status}`,
        );
        return undefined;
      }

      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        this.logger.warn(
          `第三方回填接口返回结构不符合预期（非对象），按未命中处理：url=${apiUrl}`,
        );
        return undefined;
      }

      return body as Record<string, string>;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `调用第三方回填接口失败：url=${apiUrl}, reason=${reason}`,
        err instanceof Error ? err.stack : undefined,
      );
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureBatchExists(batchId: string): Promise<void> {
    const batch = await this.commissionBatchRepository.findOne({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('批次不存在');
    }
  }
}

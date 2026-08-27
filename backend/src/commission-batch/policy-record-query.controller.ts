import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PageResultDto } from '../common/dto/page-result.dto';
import { PolicyRecord } from '../policy-record/policy-record.entity';
import { QueryPolicyRecordDto } from './dto/query-policy-record.dto';
import {
  FillResultDto,
  PolicyRecordQueryService,
} from './policy-record-query.service';

/**
 * 独立 Controller（不复用 commission-batch.controller.ts，避免同文件并行编辑冲突，
 * 与 import.controller.ts 同一处理方式，见任务包 known-risks）。
 * 路由前缀 `api/commission-batches/:batchId/policy-records` 与
 * `CommissionBatchController`（`api/commission-batches[/:id[/status]]`）、
 * `ImportController`（`api/commission-batches/:batchId/imports*`）的路径段字面量均不同，
 * Express 路由不会互相截获（BE-LAYER-02 已核对全局无同路径冲突）。
 * 未标注 @Public()：走全局鉴权 Guard 默认受保护路径（SH-AUTH-01）。
 * 只做接收转发，业务逻辑全部在 Service（BE-LAYER-01）。
 */
@Controller('api/commission-batches/:batchId/policy-records')
export class PolicyRecordQueryController {
  constructor(
    private readonly policyRecordQueryService: PolicyRecordQueryService,
  ) {}

  @Get()
  findPage(
    @Param('batchId') batchId: string,
    @Query() query: QueryPolicyRecordDto,
  ): Promise<PageResultDto<PolicyRecord>> {
    return this.policyRecordQueryService.findPage(batchId, query);
  }

  @Post('fill')
  fill(@Param('batchId') batchId: string): Promise<FillResultDto> {
    return this.policyRecordQueryService.fill(batchId);
  }
}

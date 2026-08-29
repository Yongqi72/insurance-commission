import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PageResultDto } from '../common/dto/page-result.dto';
import { extractOperator } from '../common/utils/extract-operator.util';
import { QueryPolicyRecordDto } from './dto/query-policy-record.dto';
import { UpdateSalesNameDto } from './dto/update-sales-name.dto';
import { PolicyRecord } from './policy-record.entity';
import {
  PolicyRecordService,
  SalesFillLogItemDto,
} from './policy-record.service';

/**
 * 未标注 @Public()：走全局鉴权 Guard 默认受保护路径，标杆穿透切片的核心断言点。
 * `@Controller` 路径本期由 `policy-records` 改为 `api/policy-records`（对齐 TRD 全篇
 * `/api/` 前缀约定），连带 V0 已有 GET 路由的实际路径一并改变，已同步更新前端调用
 * （frontend/src/api/policy-record.ts）与本 Controller 既有 e2e 测试的路径断言。
 */
@Controller('api/policy-records')
export class PolicyRecordController {
  constructor(private readonly policyRecordService: PolicyRecordService) {}

  @Get()
  findPage(
    @Query() query: QueryPolicyRecordDto,
  ): Promise<PageResultDto<PolicyRecord>> {
    return this.policyRecordService.findPage(query);
  }

  @Patch(':id/sales-name')
  updateSalesName(
    @Param('id') id: string,
    @Body() dto: UpdateSalesNameDto,
    @Req() request: Request,
  ): Promise<PolicyRecord> {
    return this.policyRecordService.updateSalesName(
      id,
      dto,
      extractOperator(request),
    );
  }

  @Get(':id/sales-fill-logs')
  findSalesFillLogs(@Param('id') id: string): Promise<SalesFillLogItemDto[]> {
    return this.policyRecordService.findSalesFillLogs(id);
  }
}

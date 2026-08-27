import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CommissionTier } from './commission-tier.entity';
import {
  ChangeLogItemDto,
  CommissionTierListResult,
  CommissionTierService,
} from './commission-tier.service';
import { UpsertCommissionTierDto } from './dto/upsert-commission-tier.dto';

/**
 * 未标注 @Public()：走全局鉴权 Guard 默认受保护路径（SH-AUTH-01）。
 * 路由前缀 `api/commission-tiers` 与既有 `api/commission-batches*`/`api/policy-records*`
 * 路径段字面量均不同，无冲突（BE-LAYER-02）。
 * Controller 只做接收转发，业务逻辑全部在 Service（BE-LAYER-01）。
 */
@Controller('api/commission-tiers')
export class CommissionTierController {
  constructor(private readonly commissionTierService: CommissionTierService) {}

  @Get()
  findAll(): Promise<CommissionTierListResult> {
    return this.commissionTierService.findAll();
  }

  @Get('change-logs')
  findChangeLogs(): Promise<ChangeLogItemDto[]> {
    return this.commissionTierService.findChangeLogs();
  }

  @Post()
  create(
    @Body() dto: UpsertCommissionTierDto,
    @Req() request: Request,
  ): Promise<CommissionTier> {
    return this.commissionTierService.create(
      dto,
      this.extractOperator(request),
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpsertCommissionTierDto,
    @Req() request: Request,
  ): Promise<CommissionTier> {
    return this.commissionTierService.update(
      id,
      dto,
      this.extractOperator(request),
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: Request): Promise<void> {
    return this.commissionTierService.remove(id, this.extractOperator(request));
  }

  /** 操作人取自当前登录管理员（JwtAuthGuard 校验通过后挂载的 request.user）。 */
  private extractOperator(request: Request): string {
    const user = (request as Request & { user?: { username?: string } }).user;
    return user?.username ?? 'unknown';
  }
}

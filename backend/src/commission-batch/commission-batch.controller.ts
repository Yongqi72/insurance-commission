import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { PageResultDto } from '../common/dto/page-result.dto';
import { CommissionBatch } from './commission-batch.entity';
import { CommissionBatchService } from './commission-batch.service';
import { CreateCommissionBatchDto } from './dto/create-commission-batch.dto';
import { UpdateCommissionBatchStatusDto } from './dto/update-commission-batch-status.dto';

/**
 * 未标注 @Public()：走全局鉴权 Guard 默认受保护路径（SH-AUTH-01）。
 * TRD 全篇新接口路径带 /api/ 前缀，V0 未配置 setGlobalPrefix('api')，
 * 本包按 TRD 字面在装饰器内显式带上 api/ 前缀（context 已记录，不改 main.ts 全局前缀）。
 * Controller 只做接收转发，业务逻辑全部在 Service（BE-LAYER-01）。
 */
@Controller('api/commission-batches')
export class CommissionBatchController {
  constructor(
    private readonly commissionBatchService: CommissionBatchService,
  ) {}

  @Post()
  create(
    @Body() createCommissionBatchDto: CreateCommissionBatchDto,
  ): Promise<CommissionBatch> {
    return this.commissionBatchService.create(createCommissionBatchDto);
  }

  @Get()
  findPage(
    @Query() query: PageQueryDto,
  ): Promise<PageResultDto<CommissionBatch>> {
    return this.commissionBatchService.findPage(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<CommissionBatch> {
    return this.commissionBatchService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateCommissionBatchStatusDto: UpdateCommissionBatchStatusDto,
  ): Promise<CommissionBatch> {
    return this.commissionBatchService.updateStatus(
      id,
      updateCommissionBatchStatusDto,
    );
  }
}

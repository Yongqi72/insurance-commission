import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CommissionReportService,
  CommissionSummaryResultDto,
  ExportListItemDto,
} from './commission-report.service';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * 未标注 @Public()：走全局鉴权 Guard 默认受保护路径（SH-AUTH-01）。
 * 路由前缀 `api/commission-batches/:id` 与既有 `CommissionBatchController`
 * （`api/commission-batches[/:id[/status]]`）、`ImportController`
 * （`api/commission-batches/:batchId/imports*`）、`PolicyRecordQueryController`
 * （`api/commission-batches/:batchId/policy-records*`）的路径段字面量均不同
 * （commission-summary/commission-report/exports 三段），Express 路由不会互相
 * 截获（BE-LAYER-02 已核对全局无同路径冲突）。
 * Controller 只做接收转发，业务逻辑全部在 Service（BE-LAYER-01）；导出接口需要直接
 * 操作底层响应对象写二进制流，其余两个接口仍走标准 JSON 信封（SuccessInterceptor 自动包装）。
 */
@Controller('api/commission-batches/:id')
export class CommissionReportController {
  constructor(
    private readonly commissionReportService: CommissionReportService,
  ) {}

  @Get('commission-summary')
  getSummary(@Param('id') id: string): Promise<CommissionSummaryResultDto> {
    return this.commissionReportService.getSummary(id);
  }

  /**
   * 二进制文件流响应，非 JSON data 字段（api-contract 已注明）：注入原生 Response 自行
   * setHeader + send，绕开 SuccessInterceptor 的信封包装；规则不完整/批次不存在时
   * Service 直接抛出的异常仍先于 res.send() 触发，走全局 AllExceptionsFilter 的标准
   * 错误信封（2002/1004），不会被本方法误吞或提前写出二进制响应头。
   */
  @Get('commission-report')
  async exportReport(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } =
      await this.commissionReportService.exportReport(id);

    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.send(buffer);
  }

  @Get('exports')
  listExports(@Param('id') id: string): Promise<ExportListItemDto[]> {
    return this.commissionReportService.listExports(id);
  }
}

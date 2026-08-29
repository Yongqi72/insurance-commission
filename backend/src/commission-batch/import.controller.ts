import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ImportExcelResultDto,
  ImportFileListItemDto,
  ImportService,
  UploadedExcelFile,
} from './import.service';

/**
 * 上传文件大小上限：20MB（escalate-if 记录：TRD/PRD 均未规定具体阈值，仅提及账单 sheet 实测
 * 约 1300~1500 行属正常规模；取保守值防止恶意大文件耗尽内存，如产品侧另有明确期望需人工调整）。
 */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * 独立 Controller（不复用 commission-batch.controller.ts，避免同文件并行编辑冲突，见任务包
 * known-risks）。路由前缀 `api/commission-batches/:batchId/imports` 与
 * `CommissionBatchController` 的 `api/commission-batches/:id` 段数不同，Express 路由不会互相
 * 截获（BE-LAYER-02 已核对全局无同路径冲突）。
 * 未标注 @Public()：走全局鉴权 Guard 默认受保护路径（SH-AUTH-01）。
 * 只做接收转发，业务逻辑全部在 ImportService（BE-LAYER-01）。
 */
@Controller('api/commission-batches/:batchId/imports')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @Param('batchId') batchId: string,
    @UploadedFile() file: UploadedExcelFile | undefined,
  ): Promise<ImportExcelResultDto> {
    return this.importService.importExcel(batchId, file);
  }

  @Get()
  findAll(@Param('batchId') batchId: string): Promise<ImportFileListItemDto[]> {
    return this.importService.listImports(batchId);
  }

  @Delete(':importId')
  remove(
    @Param('batchId') batchId: string,
    @Param('importId') importId: string,
  ): Promise<void> {
    return this.importService.deleteImport(batchId, importId);
  }
}

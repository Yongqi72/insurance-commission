import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExcelParser } from '../common/excel/excel-parser';
import { OssClient } from '../common/oss/oss-client';
import { buildDatedOssKey } from '../common/oss/oss-key.util';
import { PolicyRecord } from '../policy-record/policy-record.entity';
import { CommissionBatch } from './commission-batch.entity';
import { ensureBatchExists } from './ensure-batch-exists.util';
import { ImportFile } from './import-file.entity';

/**
 * multer 内存存储产出的上传文件最小形状：仅声明本包实际用到的字段，
 * 不依赖完整的 `Express.Multer.File` 类型。
 */
export interface UploadedExcelFile {
  originalname: string;
  buffer: Buffer;
}

export interface ImportFailRowDto {
  row: number;
  reason: string;
}

export interface ImportExcelResultDto {
  importFileId: string;
  fileName: string;
  successCount: number;
  failCount: number;
  failRows: ImportFailRowDto[];
}

export interface ImportFileListItemDto {
  id: string;
  fileName: string;
  importedAt: Date;
  successCount: number;
  failCount: number;
  downloadUrl: string;
}

/**
 * 批次下 Excel 导入相关业务逻辑（TRD §接口：POST/GET/DELETE .../imports，PRD AC-03/AC-04）。
 * 同步阻塞处理：解析 + 入库在一次 HTTP 请求内完成，不接入异步任务队列（TRD §交互技术方案）。
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @InjectRepository(CommissionBatch)
    private readonly commissionBatchRepository: Repository<CommissionBatch>,
    @InjectRepository(ImportFile)
    private readonly importFileRepository: Repository<ImportFile>,
    private readonly ossClient: OssClient,
    private readonly excelParser: ExcelParser,
    private readonly dataSource: DataSource,
  ) {}

  async importExcel(
    batchId: string,
    file: UploadedExcelFile | undefined,
  ): Promise<ImportExcelResultDto> {
    await ensureBatchExists(this.commissionBatchRepository, batchId);

    if (!file) {
      throw new BadRequestException('文件不能为空');
    }

    // multer 底层 busboy 默认按 latin1 解析 multipart 请求头，非 ASCII 文件名（如中文账单文件名，
    // 见 PRD AC-03 示例"7月账单.xlsx"）会被误解码成乱码；反向转回 utf8 还原真实文件名，供 OSS
    // key、导入文件记录 file_name、响应 fileName 使用。纯 ASCII 文件名经此转换后不变，无副作用。
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    // OSS 归档（BE-EXT-02 统一经 OssClient 调用）与 Excel 解析都只读同一份内存中的
    // file.buffer，互不依赖对方结果，并行执行降低总延迟；解析结果本身是判别联合类型
    // （ok:true/false），不会因为解析失败而 reject，故并行不影响"无论解析成功与否，
    // 原始文件都要写入 OSS"这条既有保证——upload() 抛错时 Promise.all 整体 reject，
    // 与原先顺序写法在 upload 失败路径下的行为一致（均不落库、不产生导入记录）。
    const ossKey = buildDatedOssKey('upload', fileName);
    const [, parseResult] = await Promise.all([
      this.ossClient.upload(file.buffer, ossKey),
      this.excelParser.parse(file.buffer),
    ]);
    // 用 `=== false` 而非 `!parseResult.ok` 触发判别联合类型收窄：本仓 tsconfig
    // `strictNullChecks: false`，`!x.ok` 写法在该配置下不会收窄 `ExcelParseResult`
    // 联合类型（实测复现，`=== false`/`=== true` 显式比较不受此限制）。
    if (parseResult.ok === false) {
      this.logger.warn(
        `批次 ${batchId} 导入文件解析失败：reason=${parseResult.reason}, fileName=${fileName}, ossKey=${ossKey}`,
      );
      throw new BadRequestException(parseResult.message);
    }

    const { successRows, failRows } = parseResult;

    const savedImportFile = await this.dataSource.transaction(
      async (manager) => {
        const importFile = await manager.save(
          manager.create(ImportFile, {
            batchId,
            fileName,
            ossKey,
            importedAt: new Date(),
            successCount: successRows.length,
            failCount: failRows.length,
          }),
        );

        if (successRows.length > 0) {
          const policyRecords = successRows.map((row) =>
            manager.create(PolicyRecord, {
              customerName: row.customerName,
              workOrderNo: row.workOrderNo,
              businessType: row.businessType,
              currency: row.currency,
              policyholder: row.policyholder,
              insuredAmount: row.insuredAmount,
              premiumAmount: row.premiumAmount,
              policyNo: row.policyNo,
              importBatchId: batchId,
              importFileId: importFile.id,
              salesFillSource: 'unmatched',
            }),
          );
          await manager.save(policyRecords);
        }

        return importFile;
      },
    );

    return {
      importFileId: savedImportFile.id,
      fileName: savedImportFile.fileName,
      successCount: savedImportFile.successCount,
      failCount: savedImportFile.failCount,
      failRows: failRows.map((row) => ({
        row: row.rowNumber,
        reason: row.reason,
      })),
    };
  }

  async listImports(batchId: string): Promise<ImportFileListItemDto[]> {
    await ensureBatchExists(this.commissionBatchRepository, batchId);

    const imports = await this.importFileRepository.find({
      where: { batchId },
      order: { importedAt: 'DESC' },
    });

    return Promise.all(
      imports.map(async (item) => ({
        id: item.id,
        fileName: item.fileName,
        importedAt: item.importedAt,
        successCount: item.successCount,
        failCount: item.failCount,
        downloadUrl: await this.ossClient.getSignedUrl(item.ossKey),
      })),
    );
  }

  async deleteImport(batchId: string, importId: string): Promise<void> {
    const importFile = await this.importFileRepository.findOne({
      where: { id: importId, batchId },
    });
    if (!importFile) {
      throw new NotFoundException('导入记录不存在');
    }

    // 事务内先删关联保单记录、再删导入文件记录本身（硬删除，不可逆）；OSS 原文件不删除。
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PolicyRecord, { importFileId: importId });
      await manager.delete(ImportFile, { id: importId });
    });
  }
}

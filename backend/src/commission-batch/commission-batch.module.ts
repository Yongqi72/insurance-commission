import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExcelParser } from '../common/excel/excel-parser';
import { OssModule } from '../common/oss/oss.module';
import { PolicyRecord } from '../policy-record/policy-record.entity';
import { CommissionBatchController } from './commission-batch.controller';
import { CommissionBatch } from './commission-batch.entity';
import { CommissionBatchService } from './commission-batch.service';
import { ImportFile } from './import-file.entity';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { PolicyRecordQueryController } from './policy-record-query.controller';
import { PolicyRecordQueryService } from './policy-record-query.service';

/**
 * controllers/providers 用数组形式声明：ic-v1-003、ic-v1-004 各自在本文件追加自己的
 * Controller/Service 注册（导入相关接口、批次维度保单记录查询+回填接口），追加方式为
 * 向数组 push 新项，不覆盖 ic-v1-002 已注册的 CommissionBatch 相关项（known-risks 已
 * 记录，合并时按数组合并处理，非逻辑冲突）。
 * `imports` 数组同步追加 ImportFile/PolicyRecord 的仓储注册（ImportService/
 * PolicyRecordQueryService 需要）与 OssModule（导入文件归档，BE-EXT-02）；PolicyRecord
 * 已在 policy-record 模块注册过仓储，这里再注册一份是 TypeORM 允许的多模块共用同一
 * Entity 的标准做法，非重复定义。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CommissionBatch, ImportFile, PolicyRecord]),
    OssModule,
  ],
  controllers: [
    CommissionBatchController,
    ImportController,
    PolicyRecordQueryController,
  ],
  providers: [
    CommissionBatchService,
    ImportService,
    ExcelParser,
    PolicyRecordQueryService,
  ],
})
export class CommissionBatchModule {}

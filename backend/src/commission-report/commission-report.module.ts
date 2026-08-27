import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionBatch } from '../commission-batch/commission-batch.entity';
import { CommissionTier } from '../commission-tier/commission-tier.entity';
import { ExcelBuilder } from '../common/excel/excel-builder';
import { OssModule } from '../common/oss/oss.module';
import { PolicyRecord } from '../policy-record/policy-record.entity';
import { CommissionReportController } from './commission-report.controller';
import { CommissionReportService } from './commission-report.service';
import { ExportRecord } from './export-record.entity';

/**
 * 提成汇总与导出模块（TRD §模块拆分）：实时汇总计算（内含单一权威 calcCommission()）+
 * 导出 Excel（复用 common/excel 的 ExcelBuilder + common/oss 的 OssClient）。
 * CommissionBatch/CommissionTier/PolicyRecord 均已在各自归属模块注册过仓储，这里再各注册
 * 一份是 TypeORM 允许的多模块共用同一 Entity 的标准做法（commission-batch.module.ts 顶部
 * 注释已有先例），非重复定义；ExportRecord 为本模块独有仓储。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommissionBatch,
      CommissionTier,
      PolicyRecord,
      ExportRecord,
    ]),
    OssModule,
  ],
  controllers: [CommissionReportController],
  providers: [CommissionReportService, ExcelBuilder],
})
export class CommissionReportModule {}

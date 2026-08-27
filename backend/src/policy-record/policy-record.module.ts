import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PolicyRecordController } from './policy-record.controller';
import { PolicyRecord } from './policy-record.entity';
import { PolicyRecordService } from './policy-record.service';
import { SalesFillLog } from './sales-fill-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PolicyRecord, SalesFillLog])],
  controllers: [PolicyRecordController],
  providers: [PolicyRecordService],
})
export class PolicyRecordModule {}

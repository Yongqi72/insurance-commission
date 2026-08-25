import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PolicyRecordController } from './policy-record.controller';
import { PolicyRecord } from './policy-record.entity';
import { PolicyRecordService } from './policy-record.service';

@Module({
  imports: [TypeOrmModule.forFeature([PolicyRecord])],
  controllers: [PolicyRecordController],
  providers: [PolicyRecordService],
})
export class PolicyRecordModule {}

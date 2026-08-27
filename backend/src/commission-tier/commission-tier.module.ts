import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionTierChangeLog } from './commission-tier-change-log.entity';
import { CommissionTierController } from './commission-tier.controller';
import { CommissionTier } from './commission-tier.entity';
import { CommissionTierService } from './commission-tier.service';

/**
 * 阶梯规则模块：CRUD + 冲突/完整性判定 + 变更日志（TRD §模块拆分）。
 * 独立于 policy-record / commission-batch 两个既有模块，不共享 Entity/Repository。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CommissionTier, CommissionTierChangeLog]),
  ],
  controllers: [CommissionTierController],
  providers: [CommissionTierService],
})
export class CommissionTierModule {}

import { Controller, Get, Query } from '@nestjs/common';
import { PageResultDto } from '../common/dto/page-result.dto';
import { QueryPolicyRecordDto } from './dto/query-policy-record.dto';
import { PolicyRecord } from './policy-record.entity';
import { PolicyRecordService } from './policy-record.service';

/**
 * 未标注 @Public()：走全局鉴权 Guard 默认受保护路径，标杆穿透切片的核心断言点。
 */
@Controller('policy-records')
export class PolicyRecordController {
  constructor(private readonly policyRecordService: PolicyRecordService) {}

  @Get()
  findPage(
    @Query() query: QueryPolicyRecordDto,
  ): Promise<PageResultDto<PolicyRecord>> {
    return this.policyRecordService.findPage(query);
  }
}

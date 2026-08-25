import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageResultDto } from '../common/dto/page-result.dto';
import { QueryPolicyRecordDto } from './dto/query-policy-record.dto';
import { PolicyRecord } from './policy-record.entity';

/**
 * 无多租户/权限边界（foundation.md 已判定数据隔离不适用），
 * 直接用标准 TypeORM Repository，无需作用域 base repo。
 */
@Injectable()
export class PolicyRecordService {
  constructor(
    @InjectRepository(PolicyRecord)
    private readonly policyRecordRepository: Repository<PolicyRecord>,
  ) {}

  async findPage(
    query: QueryPolicyRecordDto,
  ): Promise<PageResultDto<PolicyRecord>> {
    const { page, pageSize } = query;
    const [list, total] = await this.policyRecordRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return new PageResultDto(list, total, page, pageSize);
  }
}

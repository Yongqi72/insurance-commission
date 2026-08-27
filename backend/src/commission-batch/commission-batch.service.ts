import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { PageResultDto } from '../common/dto/page-result.dto';
import { CommissionBatch } from './commission-batch.entity';
import { CreateCommissionBatchDto } from './dto/create-commission-batch.dto';
import { UpdateCommissionBatchStatusDto } from './dto/update-commission-batch-status.dto';

/**
 * 批次管理：CRUD + 状态切换（TRD §接口：/api/commission-batches*，PRD AC-01/AC-02/AC-05）。
 * 状态切换为纯字段更新，不联动导入/回填/补录/导出（do-not 明确排除）。
 */
@Injectable()
export class CommissionBatchService {
  constructor(
    @InjectRepository(CommissionBatch)
    private readonly commissionBatchRepository: Repository<CommissionBatch>,
  ) {}

  async create(dto: CreateCommissionBatchDto): Promise<CommissionBatch> {
    // name 不做唯一性校验，允许与已有批次重名（AC-01）；status 固定初始值 doing。
    const batch = this.commissionBatchRepository.create({
      name: dto.name,
      status: 'doing',
    });
    return this.commissionBatchRepository.save(batch);
  }

  async findPage(query: PageQueryDto): Promise<PageResultDto<CommissionBatch>> {
    const { page, pageSize } = query;
    const [list, total] = await this.commissionBatchRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return new PageResultDto(list, total, page, pageSize);
  }

  async findOne(id: string): Promise<CommissionBatch> {
    const batch = await this.commissionBatchRepository.findOne({
      where: { id },
    });
    if (!batch) {
      throw new NotFoundException('批次不存在');
    }
    return batch;
  }

  async updateStatus(
    id: string,
    dto: UpdateCommissionBatchStatusDto,
  ): Promise<CommissionBatch> {
    const batch = await this.findOne(id);
    // 纯标记切换：只改 status 字段，不触碰/不校验其他任何关联数据（do-not）。
    batch.status = dto.status;
    return this.commissionBatchRepository.save(batch);
  }
}

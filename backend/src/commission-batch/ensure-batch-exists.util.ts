import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CommissionBatch } from './commission-batch.entity';

/** 批次存在性校验：commission-batch/commission-report 多处复用，统一"不存在"时的错误码语义（1004）。 */
export async function ensureBatchExists(
  commissionBatchRepository: Repository<CommissionBatch>,
  batchId: string,
): Promise<CommissionBatch> {
  const batch = await commissionBatchRepository.findOne({
    where: { id: batchId },
  });
  if (!batch) {
    throw new NotFoundException('批次不存在');
  }
  return batch;
}

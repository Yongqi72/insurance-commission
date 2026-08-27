import { IsIn, IsString } from 'class-validator';
import { CommissionBatchStatus } from '../commission-batch.entity';

/** 状态仅允许 doing｜done，非法值触发 1001（TRD §接口：PATCH .../status）。 */
export class UpdateCommissionBatchStatusDto {
  @IsString()
  @IsIn(['doing', 'done'])
  status: CommissionBatchStatus;
}

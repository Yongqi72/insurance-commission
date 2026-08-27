import { IsNotEmpty, IsString } from 'class-validator';

/**
 * PATCH /api/policy-records/:id/sales-name 请求体（TRD §接口，PRD AC-08）。
 * salesName 为空（缺失/空字符串）触发全局校验管道 1001（BE-VALID-01）。
 */
export class UpdateSalesNameDto {
  @IsNotEmpty()
  @IsString()
  salesName: string;
}

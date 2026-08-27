import { IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

/**
 * POST/PATCH /api/commission-tiers 共用请求体（TRD §接口，PRD AC-10/AC-11）。
 * 单字段类型/边界校验（BE-VALID-01）：lowerBound 缺失/非数字/负数 → 1001；
 * upperBound 可空（省略即"及以上"），若提供必须为非负整数；unitPrice 非数字/非正数 → 1001。
 * lowerBound 与 upperBound 之间的大小关系（lowerBound < upperBound）为跨字段业务校验，
 * 在 Service 层完成（同样映射为 1001），不在此 DTO 内实现。
 */
export class UpsertCommissionTierDto {
  @IsInt()
  @Min(0)
  lowerBound: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  upperBound?: number;

  @IsNumber()
  @IsPositive()
  unitPrice: number;
}

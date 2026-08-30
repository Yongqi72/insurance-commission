import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

/**
 * PATCH /api/policy-records/:id/work-order-no 请求体（TRD §接口）。
 * workOrderNo 为空（缺失/空字符串）触发全局校验管道 1001（BE-VALID-01），
 * 与 UpdateSalesNameDto 的 salesName 校验模式一致。
 * resetFillStatus 为 true 且更新前 salesFillSource !== 'unmatched' 时，
 * 由服务层连带清空原销售人员回填结果（由操作人自行决定，默认不勾选）。
 */
export class UpdateWorkOrderNoDto {
  @IsNotEmpty()
  @IsString()
  workOrderNo: string;

  @IsBoolean()
  resetFillStatus: boolean;
}

import { IsIn, IsOptional, IsString } from 'class-validator';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { SalesFillSource } from '../../policy-record/policy-record.entity';

const FILL_STATUS_VALUES: SalesFillSource[] = ['unmatched', 'system', 'manual'];

/**
 * 批次维度的保单记录查询（TRD §接口：GET .../commission-batches/:id/policy-records，
 * PRD AC-05/AC-07）：在通用分页基础上新增 keyword（工作单号/保单号/客户名称三字段
 * OR 模糊匹配）与 fillStatus（回填状态精确匹配）两个可选筛选字段。
 */
export class QueryPolicyRecordDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(FILL_STATUS_VALUES)
  fillStatus?: SalesFillSource;
}

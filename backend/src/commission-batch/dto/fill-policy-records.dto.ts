import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * 分批触发回填（TRD §接口：POST .../policy-records/fill，PRD AC-06）：`limit` 省略时
 * 保持旧行为（一次处理该批次全部未匹配记录）；前端传 `limit` 时改为按 `id` 升序游标分页，
 * 每次只处理至多 `limit` 条，配合 `afterId` 承接上一批的游标，支撑前端逐批调用+进度展示。
 */
export class FillPolicyRecordsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  /** 上一批返回的 nextAfterId，游标分页起点（不传则从头开始）。 */
  @IsOptional()
  @IsString()
  afterId?: string;
}

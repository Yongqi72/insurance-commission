import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 批次名称判空按裸 @IsNotEmpty()（不 trim）——escalate-if 默认口径：
 * 纯空格字符串视为非空，创建成功；如需 trim 后判空需产品侧另行确认口径。
 */
export class CreateCommissionBatchDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

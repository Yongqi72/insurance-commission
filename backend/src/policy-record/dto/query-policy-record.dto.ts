import { PageQueryDto } from '../../common/dto/page-query.dto';

/**
 * V0 走骨架仅需分页；筛选条件（客户名称/业务类型/销售人员等）留 V1 按 PRD 补充。
 */
export class QueryPolicyRecordDto extends PageQueryDto {}

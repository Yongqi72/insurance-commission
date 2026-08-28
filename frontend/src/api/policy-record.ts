import request from './request'
import type { ApiEnvelope } from './request'

/**
 * 销售人员回填来源（须与后端 `PolicyRecord.salesFillSource` 枚举字面值严格对齐，
 * TRD §表：保单记录）：unmatched-未匹配｜system-系统回填｜manual-人工补录。
 */
export type SalesFillSource = 'unmatched' | 'system' | 'manual'

export interface PolicyRecord {
  id: string
  customerName: string
  workOrderNo: string
  businessType: string
  currency: string
  policyholder: string
  insuredAmount: number
  /** 保费（V1 新增，TRD §表：保单记录），历史数据/未识别到该列时为 null。 */
  premiumAmount: number | null
  policyNo: string
  salesName: string | null
  /** V1 新增：替代原先仅靠 salesName 是否为空判断回填状态（PRD AC-05~AC-09）。 */
  salesFillSource: SalesFillSource
  importBatchId: string | null
  createdAt: string
  updatedAt: string
}

/** 单条销售人员补录日志（TRD §接口：GET /api/policy-records/:id/sales-fill-logs，满足 AC-09）。 */
export interface SalesFillLog {
  operator: string
  changedAt: string
  oldValue: string | null
  newValue: string
}

export interface PageQuery {
  page: number
  pageSize: number
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export async function fetchPolicyRecordPage(query: PageQuery): Promise<PageResult<PolicyRecord>> {
  const res = await request.get<ApiEnvelope<PageResult<PolicyRecord>>>('/api/policy-records', {
    params: query,
  })
  return res.data.data
}

/**
 * 人工补录/覆盖保单记录的销售人员（TRD §接口：PATCH /api/policy-records/:id/sales-name，满足 AC-08）。
 * 成功后后端将 salesFillSource 置为 manual；已是 system/manual 状态的记录同样允许再次覆盖。
 * `salesName` 为空由后端校验管道拦截并返回错误码 1001，本函数不做提前拦截（交由调用方按需做 UX 优化）。
 */
export async function updateSalesName(id: string, salesName: string): Promise<PolicyRecord> {
  const res = await request.patch<ApiEnvelope<PolicyRecord>>(`/api/policy-records/${id}/sales-name`, { salesName })
  return res.data.data
}

/**
 * 查询某条保单记录的销售人员补录日志（TRD §接口：GET /api/policy-records/:id/sales-fill-logs，满足 AC-09）。
 * 后端已按 changedAt 倒序返回，前端不再排序；无记录时返回空数组。
 */
export async function fetchSalesFillLogs(id: string): Promise<SalesFillLog[]> {
  const res = await request.get<ApiEnvelope<SalesFillLog[]>>(`/api/policy-records/${id}/sales-fill-logs`)
  return res.data.data
}

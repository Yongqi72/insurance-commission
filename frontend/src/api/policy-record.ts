import request from './request'
import type { ApiEnvelope } from './request'

export interface PolicyRecord {
  id: string
  customerName: string
  workOrderNo: string
  businessType: string
  currency: string
  policyholder: string
  insuredAmount: number
  policyNo: string
  salesName: string | null
  importBatchId: string | null
  createdAt: string
  updatedAt: string
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
  const res = await request.get<ApiEnvelope<PageResult<PolicyRecord>>>('/policy-records', {
    params: query,
  })
  return res.data.data
}

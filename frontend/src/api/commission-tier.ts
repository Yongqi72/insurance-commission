import request from './request'
import type { ApiEnvelope } from './request'
import { ErrorCode } from '@/types/enums'

export interface CommissionTier {
  id: string
  lowerBound: number
  upperBound: number | null
  unitPrice: number
}

export interface CommissionTierListResult {
  tiers: CommissionTier[]
  ruleComplete: boolean
}

export interface UpsertCommissionTierPayload {
  lowerBound: number
  upperBound?: number
  unitPrice: number
}

export type CommissionTierOperationType = 'create' | 'update' | 'delete'

export interface CommissionTierSnapshot {
  lowerBound: number
  upperBound: number | null
  unitPrice: number
}

export interface CommissionTierChangeLog {
  operationType: CommissionTierOperationType
  operator: string
  changedAt: string
  beforeSnapshot: CommissionTierSnapshot | null
  afterSnapshot: CommissionTierSnapshot | null
}

/**
 * 查询提成阶梯规则全表（TRD §接口：GET /api/commission-tiers，满足 AC-12）。
 * 后端已按 lowerBound 升序返回，ruleComplete 由后端统一判定（复用共享函数），前端不自行重算完整性。
 */
export async function fetchCommissionTiers(): Promise<CommissionTierListResult> {
  const res = await request.get<ApiEnvelope<CommissionTierListResult>>('/api/commission-tiers')
  return res.data.data
}

/**
 * 新增档位（TRD §接口：POST /api/commission-tiers，满足 AC-10/AC-11）。
 * upperBound 省略表示"及以上"；冲突（1005）/字段校验失败（1001）由后端返回，
 * 调用方需在弹窗内字段级展示，不当作全局错误处理。
 */
export async function createCommissionTier(payload: UpsertCommissionTierPayload): Promise<CommissionTier> {
  const res = await request.post<ApiEnvelope<CommissionTier>>('/api/commission-tiers', payload, {
    suppressToastForCodes: [ErrorCode.CONFLICT, ErrorCode.VALIDATION_FAILED],
  })
  return res.data.data
}

/**
 * 编辑档位（TRD §接口：PATCH /api/commission-tiers/:id，满足 AC-10/AC-11）。
 */
export async function updateCommissionTier(
  id: string,
  payload: UpsertCommissionTierPayload,
): Promise<CommissionTier> {
  const res = await request.patch<ApiEnvelope<CommissionTier>>(`/api/commission-tiers/${id}`, payload, {
    suppressToastForCodes: [ErrorCode.CONFLICT, ErrorCode.VALIDATION_FAILED],
  })
  return res.data.data
}

/**
 * 删除档位（TRD §接口：DELETE /api/commission-tiers/:id，满足 AC-10）。
 */
export async function deleteCommissionTier(id: string): Promise<void> {
  await request.delete<ApiEnvelope<null>>(`/api/commission-tiers/${id}`)
}

/**
 * 查询阶梯规则变更历史（TRD §接口：GET /api/commission-tiers/change-logs，满足 AC-13）。
 * 后端已按 changedAt 倒序返回，前端不再排序。
 */
export async function fetchCommissionTierChangeLogs(): Promise<CommissionTierChangeLog[]> {
  const res = await request.get<ApiEnvelope<CommissionTierChangeLog[]>>('/api/commission-tiers/change-logs')
  return res.data.data
}

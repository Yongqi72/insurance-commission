import request from './request'
import type { ApiEnvelope } from './request'
import type { PageQuery, PageResult, PolicyRecord, SalesFillSource } from './policy-record'

export type CommissionBatchStatus = 'doing' | 'done'

export interface CommissionBatch {
  id: string
  name: string
  status: CommissionBatchStatus
  createdAt: string
  updatedAt: string
}

/**
 * 创建提成批次（TRD §接口：POST /api/commission-batches，满足 AC-01）。
 * `status` 初始值固定 `doing`，由后端决定，不接受前端传入。
 */
export async function createBatch(name: string): Promise<CommissionBatch> {
  const res = await request.post<ApiEnvelope<CommissionBatch>>('/api/commission-batches', { name })
  return res.data.data
}

/**
 * 分页查询提成批次（TRD §接口：GET /api/commission-batches，满足 AC-05）。
 * 后端已按 createdAt 倒序返回，前端不再排序。
 */
export async function fetchBatchPage(query: PageQuery): Promise<PageResult<CommissionBatch>> {
  const res = await request.get<ApiEnvelope<PageResult<CommissionBatch>>>('/api/commission-batches', {
    params: query,
  })
  return res.data.data
}

export interface ImportFailRow {
  row: number
  reason: string
}

export interface ImportExcelResult {
  importFileId: string
  fileName: string
  successCount: number
  failCount: number
  failRows: ImportFailRow[]
}

export interface ImportRecord {
  id: string
  fileName: string
  importedAt: string
  successCount: number
  failCount: number
}

/**
 * 查询批次详情（TRD §接口：GET /api/commission-batches/:id），供批次详情页头部展示、
 * 是 AC-02 状态切换操作的前提读取；批次不存在时后端返回错误码 1004。
 */
export async function fetchBatchDetail(id: string): Promise<CommissionBatch> {
  const res = await request.get<ApiEnvelope<CommissionBatch>>(`/api/commission-batches/${id}`)
  return res.data.data
}

/**
 * 切换批次状态（TRD §接口：PATCH /api/commission-batches/:id/status，满足 AC-02）。
 * 状态切换为纯字段更新，不联动/不限制导入、删除导入等任何其他操作。
 */
export async function updateBatchStatus(id: string, status: CommissionBatchStatus): Promise<CommissionBatch> {
  const res = await request.patch<ApiEnvelope<CommissionBatch>>(`/api/commission-batches/${id}/status`, { status })
  return res.data.data
}

/**
 * 查询批次全部历史导入记录（TRD §接口：GET .../imports，满足 AC-03）。
 * 后端已按 importedAt 倒序返回，前端不再排序。
 */
export async function listImports(id: string): Promise<ImportRecord[]> {
  const res = await request.get<ApiEnvelope<ImportRecord[]>>(`/api/commission-batches/${id}/imports`)
  return res.data.data
}

/**
 * 上传 Excel 导入账单（TRD §接口：POST .../imports，满足 AC-03）。
 * multipart 字段名固定为 `file`，与后端 FileInterceptor('file') 约定一致。
 */
// eslint-disable-next-line no-undef -- File/FormData 为浏览器内置全局类型，eslint.config.js globals 未登记，本文件首次引入
export async function importExcel(id: string, file: File): Promise<ImportExcelResult> {
  // eslint-disable-next-line no-undef
  const formData = new FormData()
  formData.append('file', file)
  const res = await request.post<ApiEnvelope<ImportExcelResult>>(`/api/commission-batches/${id}/imports`, formData)
  return res.data.data
}

/**
 * 删除某次导入及其产生的全部保单记录（TRD §接口：DELETE .../imports/:importId，满足 AC-04）。
 */
export async function deleteImport(id: string, importId: string): Promise<void> {
  await request.delete<ApiEnvelope<null>>(`/api/commission-batches/${id}/imports/${importId}`)
}

export interface PolicyRecordQuery extends PageQuery {
  /** 对工作单号/保单号/客户名称做模糊匹配，可选。 */
  keyword?: string
  /** 回填状态精确筛选，可选；不传即不筛选（对应筛选器的"全部"选项，AC-07）。 */
  fillStatus?: SalesFillSource
}

export interface FillResult {
  total: number
  matchedCount: number
  unmatchedCount: number
}

/**
 * 查询批次维度的保单记录明细（TRD §接口：GET .../policy-records，满足 AC-05、AC-07）。
 * 后端已按 createdAt 升序返回，前端不再排序；keyword/fillStatus 复合生效。
 */
export async function fetchBatchPolicyRecords(
  id: string,
  query: PolicyRecordQuery,
): Promise<PageResult<PolicyRecord>> {
  const res = await request.get<ApiEnvelope<PageResult<PolicyRecord>>>(
    `/api/commission-batches/${id}/policy-records`,
    { params: query },
  )
  return res.data.data
}

/**
 * 触发批次内未匹配保单记录的销售人员回填（TRD §接口：POST .../policy-records/fill，满足 AC-06）。
 * 第三方接口地址本期未配置/调用失败均不算业务错误，操作本身按成功处理，返回统计供前端提示文案。
 */
export async function triggerSalesFill(id: string): Promise<FillResult> {
  const res = await request.post<ApiEnvelope<FillResult>>(`/api/commission-batches/${id}/policy-records/fill`)
  return res.data.data
}

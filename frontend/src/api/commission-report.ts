import axios from 'axios'
import request from './request'
import type { ApiEnvelope } from './request'
import { ErrorCode } from '@/types/enums'

/** 单个 (投保人, 销售人员) 组合的实时提成明细（TRD §接口：GET .../commission-summary，满足 AC-14）。 */
export interface CommissionSummaryItem {
  salesName: string
  ticketCount: number
  commission: number
}

/**
 * 单个投保人的分组汇总；`items` 为空数组表示该投保人下全部记录未匹配销售人员（AC-16），
 * 此时 `subtotal` 恒为 0，前端不展示该字段，改展示空态文案，避免误导性合计。
 * `unmatchedCount` 为该分组内未匹配销售人员的记录条数，不计入 `subtotal`。
 */
export interface CommissionSummaryGroup {
  policyholder: string
  items: CommissionSummaryItem[]
  subtotal: number
  unmatchedCount: number
}

export interface CommissionSummaryResult {
  ruleComplete: boolean
  groups: CommissionSummaryGroup[]
}

/** 单条导出历史记录（TRD §接口：GET .../exports，满足 AC-17）；`downloadUrl` 为请求时现生成的签名 URL，非持久链接。 */
export interface ExportRecord {
  id: string
  exportedAt: string
  downloadUrl: string
}

/**
 * 查询批次提成汇总（TRD §接口：GET .../commission-summary，满足 AC-14/AC-16）。
 * 现查现算，不做计算结果快照（do-not）；`ruleComplete=false` 时 `groups` 为空数组，
 * 调用方据此展示"未配置规则，无法计算"，不当作错误处理。
 */
export async function fetchCommissionSummary(batchId: string): Promise<CommissionSummaryResult> {
  const res = await request.get<ApiEnvelope<CommissionSummaryResult>>(
    `/api/commission-batches/${batchId}/commission-summary`,
  )
  return res.data.data
}

/** 导出命中错误码 2002（阶梯规则不完整，无法导出）时抛出的专用错误，供调用方与其余业务错误码区分展示（AC-15）。 */
export class CommissionReportRuleIncompleteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommissionReportRuleIncompleteError'
  }
}

/** 导出请求命中 401（登录失效）时抛出的专用错误：request.ts 拦截器已对该场景统一弹出提示并跳转登录页，调用方据此跳过自己的错误提示，避免重复弹窗。 */
export class SessionExpiredError extends Error {
  constructor() {
    super('登录状态已失效')
    this.name = 'SessionExpiredError'
  }
}

/**
 * 从 `Content-Disposition` 响应头解析文件名（AC-15：优先取响应头文件名）。
 * 兼容 `filename="xxx.xlsx"` 与 `filename*=UTF-8''xxx.xlsx` 两种形式；解析失败返回 null 由调用方兜底。
 */
function extractFileName(contentDisposition: unknown): string | null {
  if (typeof contentDisposition !== 'string' || !contentDisposition) {
    return null
  }
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return null
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(contentDisposition)
  return plainMatch ? plainMatch[1] : null
}

/**
 * 导出提成报表 Excel（TRD §接口：GET .../commission-report，满足 AC-15/AC-16）。
 *
 * known-risks：`responseType: 'blob'` 下，即使后端返回错误信封（如 2002），响应体在浏览器端也是一个
 * Blob 对象而非可直接读取的 JSON 字符串，但其 `Content-Type` 仍是 `application/json`
 * （区别于成功响应的 Excel `Content-Type`）；必须按 Content-Type 判断后 `await blob.text()` 转文本
 * 再 `JSON.parse` 才能拿到真实 `{code, msg}`，不能把 Blob 对象本身当错误信息展示。
 * request.ts 响应拦截器对 `responseType: 'blob'` 的请求已跳过统一信封解析/toast，全部处理收敛在本函数。
 */
type CommissionReportExportResult = { blob: Blob; fileName: string }

export async function exportCommissionReport(
  batchId: string,
  fallbackFileName: string,
): Promise<CommissionReportExportResult> {
  try {
    const res = await request.get(`/api/commission-batches/${batchId}/commission-report`, {
      responseType: 'blob',
    })
    const fileName = extractFileName(res.headers['content-disposition']) ?? fallbackFileName
    return { blob: res.data, fileName }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      if (error.response.status === 401) {
        throw new SessionExpiredError()
      }
      const contentType = String(error.response.headers?.['content-type'] ?? '')
      const responseData: unknown = error.response.data
      if (contentType.includes('application/json') && responseData instanceof Blob) {
        const envelope = safeParseEnvelope(await responseData.text())
        if (envelope?.code === ErrorCode.RULE_INCOMPLETE) {
          throw new CommissionReportRuleIncompleteError(envelope.msg || '阶梯规则不完整，无法导出')
        }
        throw new Error(envelope?.msg || '导出失败，请稍后重试', { cause: error })
      }
      throw new Error('导出失败，请稍后重试', { cause: error })
    }
    throw new Error('网络异常，请稍后重试', { cause: error })
  }
}

/** 尝试把导出报表错误响应体解析为业务信封；解析失败（非预期的 JSON 结构）时返回 null 由调用方兜底。 */
function safeParseEnvelope(text: string): ApiEnvelope<unknown> | null {
  try {
    return JSON.parse(text) as ApiEnvelope<unknown>
  } catch {
    return null
  }
}

/**
 * 查询批次导出历史（TRD §接口：GET .../exports，满足 AC-17）。
 * 后端已按 exportedAt 倒序返回，前端不再排序；无记录时返回空数组。
 */
export async function fetchExportHistory(batchId: string): Promise<ExportRecord[]> {
  const res = await request.get<ApiEnvelope<ExportRecord[]>>(`/api/commission-batches/${batchId}/exports`)
  return res.data.data
}

/**
 * 触发浏览器下载一个内存中的 Blob（导出 Excel 用，AC-15）。
 * 用完即撤销 objectURL，避免内存泄漏；不依赖服务端跳转，纯前端触发。
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 触发浏览器下载一个远程 URL（导出历史"重新下载"用，AC-17）。
 * `downloadUrl` 为跨域 OSS 签名直链，`download` 属性对跨域链接会被浏览器忽略，
 * 实际是否直接下载由 OSS 侧响应头决定，此处仅负责发起导航，不重新调用导出计算接口。
 */
export function triggerUrlDownload(url: string): void {
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

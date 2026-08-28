import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import { TOKEN_KEY } from '@/constants/storage'
import { ErrorCode } from '@/types/enums'

/**
 * 唯一 Axios 实例（standards-frontend.md HTTP 单例，SH-AUTH-01）：
 * 请求拦截器注入 token；响应拦截器识别错误信封统一处理（toast + 401 跳转登录）。
 */
export interface ApiEnvelope<T> {
  code: number
  msg: string
  data: T
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** 命中这些业务错误码时跳过响应拦截器的全局 toast，交由调用方自行做字段级展示（AC-11）。 */
    suppressToastForCodes?: number[]
  }
}

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
  timeout: 15000,
})

request.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

request.interceptors.response.use(
  (response) => {
    // responseType 'blob' 的成功响应体是 Blob（如导出 Excel），不是 {code,msg,data} 信封，
    // 不能套用下方信封解析（否则 Blob 会被当成"code 缺失"误判为业务错误，见 known-risks）；
    // 调用方（如 api/commission-report.ts）自行处理 blob 响应，此处原样放行。
    if (response.config.responseType === 'blob') {
      return response
    }
    const envelope = response.data as ApiEnvelope<unknown>
    if (envelope && typeof envelope === 'object' && envelope.code !== ErrorCode.SUCCESS) {
      handleBusinessError(envelope)
      return Promise.reject(new Error(envelope.msg || '请求失败'))
    }
    return response
  },
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    // 同上：blob 请求的错误响应体在浏览器端仍是 Blob（Content-Type 才区分是否为 JSON 错误信封），
    // 此处无法直接读出 {code,msg}，统一 toast 会展示不可读内容；交由调用方按 Content-Type 自行解析并反馈。
    // 但登录失效（401）是跨所有请求路径必须一致的行为，HTTP 状态码同步可读、无需解析 blob 响应体，
    // 因此单独在此判断状态码以保持与非 blob 请求相同的登出+跳转登录页逻辑。
    if (error.config?.responseType === 'blob') {
      if (error.response?.status === 401) {
        localStorage.removeItem(TOKEN_KEY)
        ElMessage.error('登录状态已失效，请重新登录')
        router.push('/login')
      }
      return Promise.reject(error)
    }
    const envelope = error.response?.data
    if (envelope) {
      handleBusinessError(envelope, error.config?.suppressToastForCodes)
    } else {
      ElMessage.error('网络异常，请稍后重试')
    }
    return Promise.reject(error)
  },
)

function handleBusinessError(envelope: ApiEnvelope<unknown>, suppressToastForCodes?: number[]): void {
  if (envelope.code === ErrorCode.UNAUTHORIZED) {
    localStorage.removeItem(TOKEN_KEY)
    ElMessage.error(envelope.msg || '登录状态已失效，请重新登录')
    router.push('/login')
    return
  }
  if (suppressToastForCodes?.includes(envelope.code)) {
    return
  }
  ElMessage.error(envelope.msg || '请求失败')
}

export default request

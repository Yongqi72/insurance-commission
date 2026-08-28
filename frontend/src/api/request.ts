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
    const envelope = response.data as ApiEnvelope<unknown>
    if (envelope && typeof envelope === 'object' && envelope.code !== ErrorCode.SUCCESS) {
      handleBusinessError(envelope)
      return Promise.reject(new Error(envelope.msg || '请求失败'))
    }
    return response
  },
  (error: AxiosError<ApiEnvelope<unknown>>) => {
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

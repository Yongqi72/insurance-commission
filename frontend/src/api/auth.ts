import request from './request'
import type { ApiEnvelope } from './request'

export interface LoginParams {
  username: string
  password: string
}

export interface LoginResult {
  accessToken: string
}

export async function login(params: LoginParams): Promise<LoginResult> {
  const res = await request.post<ApiEnvelope<LoginResult>>('/auth/login', params)
  return res.data.data
}

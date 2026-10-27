/** 统一登录接口映射，见 docs/trd-phase3.md 3.2。 */
import { postJson, request } from './client'
import type {
  AuthLoginResponse,
  AuthLogoutResponse,
  AuthPreloadResponse,
  AuthSourceId,
  AuthSourceRetryResponse,
  AuthStatusResponse,
} from '@/types'

export type LoginRequest = {
  loginId: string
  username?: string
  password?: string
  captcha?: string
}

export function preloadAuth(): Promise<AuthPreloadResponse> {
  return postJson<AuthPreloadResponse>('/api/auth/preload', {})
}

export function loginAuth(input: LoginRequest): Promise<AuthLoginResponse> {
  return postJson<AuthLoginResponse>('/api/auth/login', input)
}

export function fetchAuthStatus(validate = false): Promise<AuthStatusResponse> {
  return request<AuthStatusResponse>(
    `/api/auth/status${validate ? '?validate=1' : ''}`,
  )
}

export function retryAuthSource(source: AuthSourceId): Promise<AuthSourceRetryResponse> {
  return postJson<AuthSourceRetryResponse>(
    `/api/auth/sources/${encodeURIComponent(source)}/retry`,
    {},
  )
}

export function logoutAuth(): Promise<AuthLogoutResponse> {
  return postJson<AuthLogoutResponse>('/api/auth/logout', {})
}

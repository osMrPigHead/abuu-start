/**
 * 认证与派生类型，字段口径见 docs/trd-phase3.md 3.2 / 4.2 / 5.1。
 * 业务数据源类型仍在 types.ts；这里只放认证、会话与凭据文件结构。
 */
import type { CookieJar } from './authHttp.ts'

export type SourceId = 'byxt' | 'spoc' | 'bykc' | 'ygdk'

export type SourceStatus = 'unconfigured' | 'pending' | 'ready' | 'failed' | 'expired'

export type SourceError = {
  code: string
  message: string
}

export type SourceState = {
  status: SourceStatus
  updatedAt: string | null
  error: SourceError | null
}

export type AuthUser = {
  name: string
  schoolid: string
}

export type StoredCookie = {
  name: string
  value: string
  domain: string
  path: string
  expiresAt: number | null
  secure: boolean
  httpOnly: boolean
  hostOnly: boolean
}

export type SpocCredential = {
  token: string
  roleCode: string
}

export type BykcCredential = {
  token: string
}

export type YgdkCredential = {
  uid: number
  token: string
}

export type AuthSession = {
  username: string
  password: string | null
  user: AuthUser
  authenticatedAt: string
  cookies: StoredCookie[]
  spoc: SpocCredential | null
  bykc: BykcCredential | null
  ygdk: YgdkCredential | null
  sources: Record<SourceId, SourceState>
}

/** 一次登录尝试：只在内存中，默认 10 分钟，最多 5 个。 */
export type LoginAttempt = {
  id: string
  jar: CookieJar
  execution: string | null
  captchaId: string | null
  hidden: Record<string, string>
  alreadyLoggedIn: boolean
  createdAt: number
}

/** credentials.enc 的明文结构，见 docs/trd-phase3.md 4.2。 */
export type CredentialFile = {
  version: 1
  username: string
  password: string | null
  user: AuthUser
  authenticatedAt: string
  cookies: StoredCookie[]
  spoc: SpocCredential | null
  bykc: BykcCredential | null
  ygdk: YgdkCredential | null
  sources: Record<SourceId, Pick<SourceState, 'status' | 'updatedAt'>>
}

/** credentials.enc 的密文信封。 */
export type CredentialEnvelope = {
  version: 1
  alg: 'AES-256-GCM'
  iv: string
  tag: string
  data: string
}

export type AuthStatusResponse = {
  authenticated: boolean
  user: AuthUser | null
  authenticatedAt: string | null
  persisted: boolean
  deriving: boolean
  sources: Record<SourceId, SourceState>
  warning?: string
}

export type AuthLoginResponse = {
  authenticated: true
  user: AuthUser
  authenticatedAt: string
  persisted: boolean
  sources: Record<SourceId, SourceState>
  warning?: string
}

export type AuthPreloadResponse = {
  loginId: string
  captchaRequired: boolean
  captcha?: {
    image: string
    expiresAt: string
  }
  alreadyLoggedIn: boolean
}

export type AuthSourceRetryResponse = {
  source: SourceId
  status: SourceStatus
  updatedAt: string | null
  error: SourceError | null
}

export type AuthLogoutResponse = {
  ok: true
  warning?: string
}

export const SOURCE_IDS: readonly SourceId[] = ['byxt', 'spoc', 'bykc', 'ygdk']

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value)
}

export function emptySourceState(): SourceState {
  return { status: 'unconfigured', updatedAt: null, error: null }
}

export function emptySources(): Record<SourceId, SourceState> {
  return {
    byxt: emptySourceState(),
    spoc: emptySourceState(),
    bykc: emptySourceState(),
    ygdk: emptySourceState(),
  }
}

/**
 * 统一登录状态与流程的模块级单例，见 docs/trd-phase3.md 7.1。
 * 密码只存在于登录请求体；loginId、验证码与登录状态只存内存。
 */
import { reactive } from 'vue'
import {
  fetchAuthStatus,
  loginAuth,
  logoutAuth,
  preloadAuth,
  retryAuthSource,
  type LoginRequest,
} from '@/api/auth'
import { ApiError } from '@/api/client'
import type {
  AuthLoginResponse,
  AuthPreloadResponse,
  AuthSourceId,
  AuthSourceState,
  AuthSources,
  AuthStatusResponse,
  AuthUser,
} from '@/types'

export type AuthState = {
  authenticated: boolean
  user: AuthUser | null
  authenticatedAt: string | null
  persisted: boolean
  deriving: boolean
  checking: boolean
  checkFailed: boolean
  loading: boolean
  error: string
  warning: string
  lastErrorCode: string
  captchaRequired: boolean
  captchaImage: string | null
  alreadyLoggedIn: boolean
  sources: AuthSources
}

export const AUTH_SOURCE_ORDER: readonly AuthSourceId[] = ['byxt', 'spoc', 'bykc', 'ygdk']

export const AUTH_SOURCE_LABELS: Record<AuthSourceId, string> = {
  byxt: '本研教育管理系统',
  spoc: 'SPOC',
  bykc: '博雅课程',
  ygdk: '阳光打卡',
}

const POLL_INTERVAL_MS = 1500
const POLL_MAX_MS = 60_000

function emptySource(): AuthSourceState {
  return { status: 'unconfigured', updatedAt: null, error: null }
}

function emptySources(): AuthSources {
  return {
    byxt: emptySource(),
    spoc: emptySource(),
    bykc: emptySource(),
    ygdk: emptySource(),
  }
}

const state = reactive<AuthState>({
  authenticated: false,
  user: null,
  authenticatedAt: null,
  persisted: false,
  deriving: false,
  checking: true,
  checkFailed: false,
  loading: false,
  error: '',
  warning: '',
  lastErrorCode: '',
  captchaRequired: false,
  captchaImage: null,
  alreadyLoggedIn: false,
  sources: emptySources(),
})

/** loginId 只存内存，不写 localStorage。 */
let loginId: string | null = null
let hydratePromise: Promise<void> | null = null
let pollingTimer: ReturnType<typeof setTimeout> | null = null
/** 登录/退出后递增，丢弃迟到的认证校验结果。 */
let authEpoch = 0

export function useAuth() {
  return {
    state,
    hydrate,
    refreshStatus,
    preload,
    login,
    retrySource,
    logout,
    markSourceExpired,
    isAuthenticated,
    isAuthBlocked,
    pollWhileDeriving,
  }
}

/** 首次调用请求 status?validate=1；调用方不等待，之后复用同一 Promise。 */
function hydrate(): Promise<void> {
  hydratePromise ??= runHydrate()
  return hydratePromise
}

async function runHydrate(): Promise<void> {
  const epoch = authEpoch
  state.checking = true
  state.checkFailed = false

  const ok = await refreshStatus(true)
  if (epoch !== authEpoch) return

  state.checking = false
  state.checkFailed = !ok
}

/** 认证校验失败时返回 false，由调用方决定是否提示。 */
async function refreshStatus(validate = false): Promise<boolean> {
  const epoch = authEpoch

  try {
    const response = await fetchAuthStatus(validate)
    if (epoch !== authEpoch) return false
    applyStatus(response)
    return true
  } catch (error) {
    if (epoch !== authEpoch) return false
    state.warning = authErrorMessage(error).message
    return false
  }
}

/** 预加载登录页；验证码错误后也用它刷新验证码。 */
async function preload(): Promise<AuthPreloadResponse | null> {
  state.error = ''
  state.lastErrorCode = ''
  state.captchaImage = null
  state.captchaRequired = false

  try {
    const response = await preloadAuth()
    loginId = response.loginId
    state.captchaRequired = response.captchaRequired
    state.captchaImage = response.captcha?.image ?? null
    state.alreadyLoggedIn = response.alreadyLoggedIn
    return response
  } catch (error) {
    const mapped = authErrorMessage(error)
    loginId = null
    state.error = mapped.message
    state.lastErrorCode = mapped.code
    return null
  }
}

async function login(input: {
  username: string
  password: string
  captcha?: string
}): Promise<boolean> {
  if (loginId === null) {
    const prepared = await preload()
    if (!prepared) return false
  }

  if (loginId === null) return false

  state.loading = true
  state.error = ''
  state.lastErrorCode = ''

  try {
    const request: LoginRequest = { loginId }
    if (!state.alreadyLoggedIn) {
      request.username = input.username.trim()
      request.password = input.password
      if (state.captchaRequired) request.captcha = (input.captcha ?? '').trim()
    }

    const response = await loginAuth(request)
    applyLogin(response)
    loginId = null
    resetLoginAttemptState()
    return true
  } catch (error) {
    const mapped = authErrorMessage(error)
    loginId = null
    state.error = mapped.message
    state.lastErrorCode = mapped.code

    if (mapped.code === 'CAPTCHA_INVALID' || mapped.code === 'CAPTCHA_REQUIRED') {
      const refreshed = await preload()
      if (refreshed) {
        // preload 会清空提示；保留登录错误便于用户判断。
        state.error = mapped.message
        state.lastErrorCode = mapped.code
      }
    }

    return false
  } finally {
    state.loading = false
  }
}

async function retrySource(source: AuthSourceId): Promise<void> {
  try {
    const response = await retryAuthSource(source)
    state.sources[source] = {
      status: response.status,
      updatedAt: response.updatedAt,
      error: response.error,
    }
    state.deriving = AUTH_SOURCE_ORDER.some(
      (id) => state.sources[id].status === 'pending',
    )
  } catch (error) {
    const mapped = authErrorMessage(error)
    state.error = mapped.message
    state.lastErrorCode = mapped.code
  }
}

async function logout(): Promise<boolean> {
  state.loading = true
  state.error = ''
  state.lastErrorCode = ''

  try {
    await logoutAuth()
    resetAuthState()
    return true
  } catch (error) {
    const mapped = authErrorMessage(error)
    state.error = mapped.message
    state.lastErrorCode = mapped.code
    return false
  } finally {
    state.loading = false
  }
}

/** 业务请求收到 AUTH_EXPIRED 时同步设置页状态。 */
export function markSourceExpired(source: AuthSourceId): void {
  state.sources[source] = {
    status: 'expired',
    updatedAt: state.sources[source].updatedAt,
    error: { code: 'AUTH_EXPIRED', message: '登录状态已失效，请重新登录' },
  }
}

export function isAuthenticated(): boolean {
  return state.authenticated
}

/**
 * 认证已确认未登录时才拦截业务请求；校验中或校验失败一律放行，
 * 由各数据源自己的响应决定卡片状态，避免慢网时首页被校验串行阻塞。
 */
export function isAuthBlocked(): boolean {
  return !state.checking && !state.checkFailed && !state.authenticated
}

/** 派生中轮询状态；返回停止函数，供设置页 onUnmounted 调用。 */
function pollWhileDeriving(): () => void {
  stopPolling()
  if (!state.deriving) return () => undefined

  const deadline = Date.now() + POLL_MAX_MS

  const schedule = (): void => {
    pollingTimer = setTimeout(() => {
      pollingTimer = null
      void refreshStatus().then(() => {
        if (!state.deriving || !state.authenticated) return
        if (Date.now() >= deadline) return
        schedule()
      })
    }, POLL_INTERVAL_MS)
  }

  schedule()
  return stopPolling
}

/* -------------------------------- 内部状态 -------------------------------- */

function applyStatus(response: AuthStatusResponse): void {
  state.authenticated = response.authenticated
  state.user = response.user
  state.authenticatedAt = response.authenticatedAt
  state.persisted = response.persisted
  state.deriving = response.deriving
  state.sources = response.sources
  state.warning = response.warning ?? ''
  state.checkFailed = false
}

function applyLogin(response: AuthLoginResponse): void {
  authEpoch += 1
  state.authenticated = true
  state.user = response.user
  state.authenticatedAt = response.authenticatedAt
  state.persisted = response.persisted
  state.deriving = true
  state.sources = response.sources
  state.warning = response.warning ?? ''
  state.checking = false
  state.checkFailed = false
}

function resetLoginAttemptState(): void {
  state.captchaRequired = false
  state.captchaImage = null
  state.alreadyLoggedIn = false
  state.error = ''
  state.lastErrorCode = ''
}

function resetAuthState(): void {
  authEpoch += 1
  state.authenticated = false
  state.user = null
  state.authenticatedAt = null
  state.persisted = false
  state.deriving = false
  state.checking = false
  state.checkFailed = false
  state.sources = emptySources()
  state.warning = ''
  resetLoginAttemptState()
  loginId = null
  stopPolling()
}

function stopPolling(): void {
  if (pollingTimer !== null) {
    clearTimeout(pollingTimer)
    pollingTimer = null
  }
}

type MappedAuthError = {
  code: string
  message: string
}

function authErrorMessage(error: unknown): MappedAuthError {
  if (!(error instanceof ApiError)) {
    return { code: '', message: '登录失败，请稍后重试' }
  }

  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return { code: error.code, message: '学号或密码错误' }
    case 'CAPTCHA_INVALID':
      return { code: error.code, message: '验证码错误或已过期，请刷新后重试' }
    case 'CAPTCHA_REQUIRED':
      return { code: error.code, message: '需要验证码，请刷新后重试' }
    case 'PASSWORD_EXPIRED':
      return {
        code: error.code,
        message: '密码已过期或账号存在安全风险，请先在浏览器完成处理',
      }
    case 'LOGIN_IN_PROGRESS':
      return { code: error.code, message: '登录请求正在处理，请稍候' }
    case 'AUTH_REQUIRED':
      return { code: error.code, message: '请先完成登录' }
    case 'AUTH_EXPIRED':
      return { code: error.code, message: '登录状态已失效，请重新登录' }
    case 'UPSTREAM_TIMEOUT':
      return { code: error.code, message: '统一认证请求超时，请稍后重试' }
    case 'UPSTREAM_ERROR':
      return { code: error.code, message: error.message }
    case 'SOURCE_BUSY':
      return { code: error.code, message: '数据源正在派生，请稍后重试' }
    case 'SOURCE_UNKNOWN':
      return { code: error.code, message: '未知数据源' }
    case 'RELAY_UNREACHABLE':
      return { code: error.code, message: error.message }
    default:
      return { code: error.code, message: error.message || '登录失败，请稍后重试' }
  }
}

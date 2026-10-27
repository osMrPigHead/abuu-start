/**
 * 认证会话：登录尝试、内存会话、自动重登与四源派生编排，见 docs/trd-phase3.md 3.2 / 6。
 * 凭据只出现在本模块内存与 credentials.enc；不写日志、不返回前端。
 */
import { randomUUID } from 'node:crypto'
import {
  buildLoginForm,
  captchaDataUrl,
  captchaUrl,
  classifyLoginFailure,
  fetchUcStatus,
  looksLikeLoginPage,
  parseLoginPage,
  SSO_LOGIN_URL,
  SSO_LOGOUT_URL,
  UC_LOGIN_URL,
} from './authCas.ts'
import {
  deriveBykc,
  deriveByxt,
  deriveSpoc,
  deriveYgdk,
  SourceDerivationError,
} from './authDerive.ts'
import { CookieJar, downloadWithJar, requestWithJar } from './authHttp.ts'
import { deleteCredentials, loadCredentials, saveCredentials } from './authStore.ts'
import {
  emptySources,
  isSourceId,
  SOURCE_IDS,
  type AuthLoginResponse,
  type AuthLogoutResponse,
  type AuthPreloadResponse,
  type AuthSession,
  type AuthSourceRetryResponse,
  type AuthStatusResponse,
  type BykcCredential,
  type CredentialFile,
  type LoginAttempt,
  type SourceError,
  type SourceId,
  type SourceState,
  type SpocCredential,
  type YgdkCredential,
} from './authTypes.ts'
import { RelayError } from './errors.ts'

const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1000
const CAPTCHA_TTL_MS = 10 * 60 * 1000
const RELOGIN_COOLDOWN_MS = 5 * 60 * 1000
/** 网络或上游 5xx 的瞬时失败冷却，短于认证失败。 */
const TRANSIENT_COOLDOWN_MS = 30 * 1000
const LOGIN_TIMEOUT_MS = 15_000
const LOGOUT_TIMEOUT_MS = 5_000

const SOURCE_LABELS: Record<SourceId, string> = {
  byxt: '本研教育管理系统',
  spoc: 'SPOC',
  bykc: '博雅课程',
  ygdk: '阳光打卡',
}

let session: AuthSession | null = null
let sessionJar: CookieJar | null = null
let persisted = false
let generation = 0
let startupWarning: string | null = null
let readyPromise: Promise<void> | null = null
let loginInFlight = false
let reloginPromise: Promise<ReloginResult> | null = null
let lastReloginFailedAt = 0
let lastReloginFailureReason: ReloginFailureReason | null = null
const attempts = new Map<string, LoginAttempt>()
/** 同一源并发派生时复用同一个 Promise，避免重复请求与状态互相覆盖。 */
const derivePromises = new Map<SourceId, { gen: number; promise: Promise<boolean> }>()

type LoginInput = {
  loginId: string
  username: string | null
  password: string | null
  captcha: string | null
}

/** 自动重登失败原因；upstream 表示网络/上游不可用，无法判定登录状态。 */
type ReloginFailureReason = 'auth' | 'upstream' | 'captcha' | 'no-password'

type ReloginResult =
  | { ok: true }
  | { ok: false; reason: ReloginFailureReason; error?: RelayError }

/** 所有 /api 请求进入前调用；保证启动恢复只跑一次。 */
export function ensureAuthReady(): Promise<void> {
  readyPromise ??= restoreSession()
  return readyPromise
}

export async function getAuthStatus(validate: boolean): Promise<AuthStatusResponse> {
  await ensureAuthReady()
  pruneAttempts()

  if (!session) {
    const response: AuthStatusResponse = {
      authenticated: false,
      user: null,
      authenticatedAt: null,
      persisted: false,
      deriving: false,
      sources: emptySources(),
    }
    if (startupWarning !== null) response.warning = startupWarning
    return response
  }

  if (validate) await validateCurrentSession()
  return snapshot()
}

export async function preloadAuth(): Promise<AuthPreloadResponse> {
  await ensureAuthReady()
  pruneAttempts()

  const attemptJar = new CookieJar()
  if (session) attemptJar.load(session.cookies)

  const pageResult = await requestWithJar(attemptJar, SSO_LOGIN_URL, {}, {
    maxRedirects: 0,
    timeoutMs: LOGIN_TIMEOUT_MS,
    upgradeSsoHttp: true,
  })

  const alreadyLoggedIn = pageResult.status >= 300 && pageResult.status < 400
  if (!alreadyLoggedIn && pageResult.status !== 200) {
    throw new RelayError('UPSTREAM_ERROR', '统一认证暂时不可用，请稍后重试')
  }

  const page = alreadyLoggedIn
    ? { execution: null, captchaId: null, hidden: {} }
    : parseLoginPage(pageResult.text)

  // 200 但不是可识别的登录页（维护页、WebVPN 门页等）：明确报上游错误，避免空 execution 提交。
  if (!alreadyLoggedIn && page.execution === null) {
    throw new RelayError('UPSTREAM_ERROR', '统一认证页面无法识别，请稍后重试或检查网络')
  }

  let captchaImage: string | null = null
  if (page.captchaId !== null) {
    try {
      const image = await downloadWithJar(attemptJar, captchaUrl(page.captchaId), {}, {
        maxRedirects: 0,
        timeoutMs: LOGIN_TIMEOUT_MS,
      })
      if (image.status >= 200 && image.status < 300 && image.data.byteLength > 0) {
        captchaImage = captchaDataUrl(image.contentType, image.data)
      }
    } catch {
      // 验证码图片失败时返回 captchaRequired:true；设置页提示刷新验证码。
    }
  }

  const id = randomUUID()
  attempts.set(id, {
    id,
    jar: attemptJar,
    execution: page.execution,
    captchaId: page.captchaId,
    hidden: page.hidden,
    alreadyLoggedIn,
    createdAt: Date.now(),
  })

  while (attempts.size > MAX_LOGIN_ATTEMPTS) {
    const oldest = [...attempts.values()].sort((left, right) => left.createdAt - right.createdAt)[0]
    if (!oldest) break
    attempts.delete(oldest.id)
  }

  const response: AuthPreloadResponse = {
    loginId: id,
    captchaRequired: page.captchaId !== null,
    alreadyLoggedIn,
  }
  if (captchaImage !== null) {
    response.captcha = {
      image: captchaImage,
      expiresAt: new Date(Date.now() + CAPTCHA_TTL_MS).toISOString(),
    }
  }
  return response
}

export async function loginAuth(raw: unknown): Promise<AuthLoginResponse> {
  await ensureAuthReady()
  pruneAttempts()

  const input = readLoginInput(raw)
  const attempt = attempts.get(input.loginId)
  if (!attempt) {
    throw new RelayError('INVALID_REQUEST', '登录已过期，请刷新验证码后重试')
  }

  if (loginInFlight) {
    throw new RelayError('LOGIN_IN_PROGRESS', '登录请求正在处理，请稍候')
  }

  attempts.delete(attempt.id)
  loginInFlight = true

  try {
    return await performLogin(attempt, input)
  } finally {
    loginInFlight = false
  }
}

export async function retryAuthSource(sourceValue: string): Promise<AuthSourceRetryResponse> {
  await ensureAuthReady()

  if (!isSourceId(sourceValue)) {
    throw new RelayError('SOURCE_UNKNOWN', '未知数据源')
  }

  const source = sourceValue
  const current = requireSession()
  if (current.sources[source].status === 'pending') {
    throw new RelayError('SOURCE_BUSY', '该数据源正在派生')
  }

  setSourceState(source, 'pending', null)
  await deriveOne(source, generation)
  const state = requireSession().sources[source]

  return {
    source,
    status: state.status,
    updatedAt: state.updatedAt,
    error: state.error,
  }
}

export async function logoutAuth(): Promise<AuthLogoutResponse> {
  await ensureAuthReady()

  if (sessionJar) {
    try {
      await requestWithJar(sessionJar, SSO_LOGOUT_URL, {}, {
        maxRedirects: 0,
        timeoutMs: LOGOUT_TIMEOUT_MS,
      })
    } catch {
      // 尽力登出；失败不阻塞本地清理。
    }
  }

  startNewGeneration()
  session = null
  sessionJar = null
  persisted = false
  startupWarning = null
  loginInFlight = false
  lastReloginFailedAt = 0
  attempts.clear()

  const failed = await deleteCredentials()
  return failed.length > 0
    ? { ok: true, warning: '部分凭据文件未能删除' }
    : { ok: true }
}

/** 业务请求的自动重登包装，见 docs/trd-phase3.md 3.5 / 6.4。 */
export async function withSourceRetry<T>(
  source: SourceId,
  handler: () => Promise<T> | T,
): Promise<T> {
  await ensureAuthReady()

  // 该源正在派生时先等它结束，避免首页取数直接收到 409。
  await waitForSource(source)

  try {
    return await handler()
  } catch (error) {
    if (!(error instanceof RelayError) || error.code !== 'AUTH_EXPIRED') throw error
    if (!session) throw new RelayError('AUTH_REQUIRED', '尚未登录')

    const recovered = await autoRelogin()
    if (!recovered.ok) {
      // 网络/上游不可用时无法判定登录状态：按瞬时失败返回，不标记已失效。
      if (recovered.reason === 'upstream') {
        throw upstreamError(recovered.error, '无法连接上游服务，请稍后重试')
      }

      markSourceExpired(source)
      throw new RelayError('AUTH_EXPIRED', '登录状态已失效，请重新登录')
    }

    const derived = await deriveOne(source, generation)
    if (!derived) {
      if (session.sources[source].status === 'expired') {
        throw new RelayError('AUTH_EXPIRED', '登录状态已失效，请重新登录')
      }
      throw new RelayError('UPSTREAM_ERROR', '数据源派生失败，请稍后重试')
    }

    try {
      return await handler()
    } catch (retryError) {
      if (retryError instanceof RelayError && retryError.code === 'AUTH_EXPIRED') {
        markSourceExpired(source)
      }
      throw retryError
    }
  }
}

/** 等待单个数据源派生完成；未轮到该源时短轮询，最长 20 秒。 */
async function waitForSource(source: SourceId): Promise<void> {
  if (!session || session.sources[source].status !== 'pending') return

  const inFlight = derivePromises.get(source)
  if (inFlight) {
    await inFlight.promise.catch(() => undefined)
    return
  }

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (!session || session.sources[source].status !== 'pending') return

    const pending = derivePromises.get(source)
    if (pending) {
      await pending.promise.catch(() => undefined)
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

/* ------------------------------ 业务凭据访问器 ------------------------------ */

export function requireSession(): AuthSession {
  if (!session) throw new RelayError('AUTH_REQUIRED', '尚未登录')
  return session
}

export function byxtCookieHeader(): string {
  requireSourceReady('byxt')
  const value = sessionJar?.headerFor('https://byxt.buaa.edu.cn/jwapp/sys/homeapp/') ?? ''

  if (value.length === 0) {
    setSourceState('byxt', 'expired', {
      code: 'AUTH_EXPIRED',
      message: '本研教育管理系统登录状态已失效',
    })
    throw new RelayError('AUTH_EXPIRED', '本研教育管理系统登录状态已失效')
  }
  return value
}

export function spocCredentials(): SpocCredential {
  const current = requireSourceReady('spoc')
  if (!current.spoc) {
    throw new RelayError('AUTH_EXPIRED', 'SPOC 登录状态已失效')
  }
  return current.spoc
}

export function bykcToken(): string {
  const current = requireSourceReady('bykc')
  if (!current.bykc) {
    throw new RelayError('AUTH_EXPIRED', '博雅登录状态已失效')
  }
  return current.bykc.token
}

export function ygdkCredentials(): YgdkCredential {
  const current = requireSourceReady('ygdk')
  if (!current.ygdk) {
    throw new RelayError('AUTH_EXPIRED', '阳光打卡登录状态已失效')
  }
  return current.ygdk
}

/* -------------------------------- 登录流程 -------------------------------- */

async function performLogin(attempt: LoginAttempt, input: LoginInput): Promise<AuthLoginResponse> {
  let username = input.username?.trim() ?? ''
  let password = input.password

  if (!attempt.alreadyLoggedIn) {
    if (username.length === 0 || password === null) {
      throw new RelayError('INVALID_CREDENTIALS', '请填写学号与密码')
    }

    let captcha: string | null = null
    if (attempt.captchaId !== null) {
      captcha = input.captcha?.trim() ?? ''
      if (captcha.length === 0) {
        throw new RelayError('CAPTCHA_REQUIRED', '需要验证码，请刷新后重试')
      }
    }

    await submitLoginForm(attempt, {
      username,
      password,
      execution: attempt.execution ?? '',
      captcha,
    })
  }

  await activateUc(attempt.jar)
  const uc = await fetchUcStatus(attempt.jar)
  if (!uc.ok) {
    throw new RelayError('UPSTREAM_ERROR', '统一认证登录失败，请稍后重试')
  }

  if (password === null && session !== null && session.username === (username || session.username)) {
    password = session.password
  }
  if (username.length === 0) username = session?.username ?? uc.user.schoolid

  const previousJar = sessionJar
  const nextJar = attempt.jar
  startNewGeneration()

  session = {
    username,
    password,
    user: uc.user,
    authenticatedAt: nowIso(),
    cookies: nextJar.serialize(),
    spoc: null,
    bykc: null,
    ygdk: null,
    sources: pendingSources(),
  }
  sessionJar = nextJar
  startupWarning = null
  persisted = await saveCurrentCredentials()
  previousJar?.clear()

  void runDerivation(generation, SOURCE_IDS)

  const response: AuthLoginResponse = {
    authenticated: true,
    user: session.user,
    authenticatedAt: session.authenticatedAt,
    persisted,
    sources: cloneSources(),
  }

  if (!persisted) {
    response.warning = '无法保存登录状态，本次运行内仍可使用'
  } else if (session.password === null) {
    response.warning = '未保存密码，会话失效后需重新登录'
  }

  return response
}

async function submitLoginForm(
  attempt: LoginAttempt,
  values: { username: string; password: string; execution: string; captcha: string | null },
): Promise<void> {
  const body = buildLoginForm(attempt.hidden, values)

  const result = await requestWithJar(attempt.jar, SSO_LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: body.toString(),
  }, {
    maxRedirects: 10,
    timeoutMs: LOGIN_TIMEOUT_MS,
    upgradeSsoHttp: true,
  })

  if (result.status === 401 || looksLikeLoginPage(result.text)) {
    throw classifyLoginFailure(result.text, result.url)
  }

  if (result.status < 200 || result.status >= 400) {
    throw new RelayError('UPSTREAM_ERROR', '统一认证登录失败，请稍后重试')
  }
}

async function activateUc(jar: CookieJar): Promise<void> {
  const result = await requestWithJar(jar, UC_LOGIN_URL, {}, {
    maxRedirects: 10,
    timeoutMs: LOGIN_TIMEOUT_MS,
    upgradeSsoHttp: true,
  })

  if (result.status < 200 || result.status >= 300) {
    throw new RelayError('UPSTREAM_ERROR', '统一认证登录失败，请稍后重试')
  }
}

/* -------------------------------- 会话校验 -------------------------------- */

async function validateCurrentSession(): Promise<void> {
  if (!session || !sessionJar) return

  let status: Awaited<ReturnType<typeof fetchUcStatus>>
  try {
    status = await fetchUcStatus(sessionJar)
  } catch {
    // 网络/上游不可用时无法判定登录状态：保留会话与四源状态，仅提示未校验。
    startupWarning = '无法连接统一认证，登录状态未校验'
    return
  }

  if (status.ok) {
    session.user = status.user
    startupWarning = null
    return
  }

  const recovered = await autoRelogin()
  if (recovered.ok) {
    startupWarning = null
    return
  }

  if (recovered.reason === 'upstream') {
    startupWarning = '无法连接统一认证，登录状态未校验'
    return
  }

  startupWarning = '登录状态已失效，请重新登录'
  for (const source of SOURCE_IDS) markSourceExpired(source)
}

/* -------------------------------- 自动重登 -------------------------------- */

async function autoRelogin(): Promise<ReloginResult> {
  if (!session) return { ok: false, reason: 'auth' }
  if (session.password === null) return { ok: false, reason: 'no-password' }

  const cooldown =
    lastReloginFailureReason === 'upstream' ? TRANSIENT_COOLDOWN_MS : RELOGIN_COOLDOWN_MS
  if (lastReloginFailureReason !== null && Date.now() - lastReloginFailedAt < cooldown) {
    return { ok: false, reason: lastReloginFailureReason }
  }

  if (reloginPromise) return reloginPromise

  const current = session
  reloginPromise = performAutoRelogin(current).finally(() => {
    reloginPromise = null
  })
  return reloginPromise
}

async function performAutoRelogin(current: AuthSession): Promise<ReloginResult> {
  if (current.password === null) return { ok: false, reason: 'no-password' }

  const nextJar = new CookieJar()

  try {
    const pageResult = await requestWithJar(nextJar, SSO_LOGIN_URL, {}, {
      maxRedirects: 0,
      timeoutMs: LOGIN_TIMEOUT_MS,
      upgradeSsoHttp: true,
    })

    if (pageResult.status === 200) {
      const page = parseLoginPage(pageResult.text)
      if (page.captchaId !== null) return failRelogin('captcha')
      // 200 但不是可识别的登录页（维护页、网关页），按上游暂时不可用处理。
      if (page.execution === null) return failRelogin('upstream')

      const body = buildLoginForm(page.hidden, {
        username: current.username,
        password: current.password,
        execution: page.execution,
        captcha: null,
      })

      const submit = await requestWithJar(nextJar, SSO_LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: body.toString(),
      }, {
        maxRedirects: 10,
        timeoutMs: LOGIN_TIMEOUT_MS,
        upgradeSsoHttp: true,
      })

      if (submit.status >= 500) return failRelogin('upstream')
      if (submit.status < 200 || submit.status >= 400 || looksLikeLoginPage(submit.text)) {
        return failRelogin('auth')
      }
    } else if (pageResult.status >= 500) {
      return failRelogin('upstream')
    } else if (!(pageResult.status >= 300 && pageResult.status < 400)) {
      return failRelogin('auth')
    }

    await activateUc(nextJar)
    const uc = await fetchUcStatus(nextJar)
    if (!uc.ok) return failRelogin('auth')

    if (session !== current) return { ok: false, reason: 'auth' }

    session.cookies = nextJar.serialize()
    session.user = uc.user
    session.authenticatedAt = nowIso()
    sessionJar = nextJar
    startNewGeneration()

    const stale = SOURCE_IDS.filter((source) => session?.sources[source].status !== 'ready')
    for (const source of stale) setSourceState(source, 'pending', null)
    persisted = await saveCurrentCredentials()
    void runDerivation(generation, stale)

    return { ok: true }
  } catch (error) {
    // fetch 抛出的 UPSTREAM_ERROR/UPSTREAM_TIMEOUT 属于瞬时失败。
    if (
      error instanceof RelayError &&
      (error.code === 'UPSTREAM_ERROR' || error.code === 'UPSTREAM_TIMEOUT')
    ) {
      return failRelogin('upstream', error)
    }
    return failRelogin('auth')
  }
}

function failRelogin(reason: ReloginFailureReason, error?: RelayError): ReloginResult {
  lastReloginFailedAt = Date.now()
  lastReloginFailureReason = reason
  return error ? { ok: false, reason, error } : { ok: false, reason }
}

/* -------------------------------- 四源派生 -------------------------------- */

async function runDerivation(gen: number, sources: readonly SourceId[]): Promise<void> {
  for (const source of sources) {
    if (gen !== generation) return
    await deriveOne(source, gen)
  }
}

function deriveOne(source: SourceId, gen: number): Promise<boolean> {
  const existing = derivePromises.get(source)
  if (existing && existing.gen === gen) return existing.promise

  let promise: Promise<boolean>
  promise = runDerive(source, gen).finally(() => {
    if (derivePromises.get(source)?.promise === promise) derivePromises.delete(source)
  })
  derivePromises.set(source, { gen, promise })
  return promise
}

async function runDerive(source: SourceId, gen: number): Promise<boolean> {
  if (!session || !sessionJar) return false

  const targetJar = sessionJar
  try {
    const result = await deriveSource(source, targetJar)
    if (gen !== generation || !session || sessionJar !== targetJar) return false

    applyDerived(source, result)
    setSourceState(source, 'ready', null)
    persisted = await saveCurrentCredentials()
    return true
  } catch (error) {
    if (gen !== generation || !session || sessionJar !== targetJar) return false

    const message =
      error instanceof SourceDerivationError
        ? error.message
        : `${SOURCE_LABELS[source]}派生失败`
    const authFailure =
      error instanceof RelayError &&
      (error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_REQUIRED')

    if (authFailure) {
      markSourceExpired(source)
    } else {
      setSourceState(source, 'failed', {
        code: 'SOURCE_DERIVATION_FAILED',
        message,
      })
    }
    persisted = await saveCurrentCredentials()
    return false
  }
}

type DerivationResult =
  | { kind: 'byxt' }
  | { kind: 'spoc'; value: SpocCredential }
  | { kind: 'bykc'; value: BykcCredential }
  | { kind: 'ygdk'; value: YgdkCredential }

async function deriveSource(source: SourceId, jar: CookieJar): Promise<DerivationResult> {
  switch (source) {
    case 'byxt':
      await deriveByxt(jar)
      return { kind: 'byxt' }
    case 'spoc':
      return { kind: 'spoc', value: await deriveSpoc(jar) }
    case 'bykc':
      return { kind: 'bykc', value: await deriveBykc(jar) }
    case 'ygdk':
      return { kind: 'ygdk', value: await deriveYgdk(jar) }
  }
}

function applyDerived(source: SourceId, result: DerivationResult): void {
  if (!session) return

  switch (source) {
    case 'spoc':
      if (result.kind === 'spoc') session.spoc = result.value
      return
    case 'bykc':
      if (result.kind === 'bykc') session.bykc = result.value
      return
    case 'ygdk':
      if (result.kind === 'ygdk') session.ygdk = result.value
      return
    default:
      return
  }
}

/* -------------------------------- 启动恢复 -------------------------------- */

async function restoreSession(): Promise<void> {
  const loaded = await loadCredentials()

  if (loaded.kind === 'missing') {
    persisted = false
    return
  }

  if (loaded.kind === 'corrupt') {
    persisted = false
    startupWarning = '登录状态无法读取，请重新登录'
    return
  }

  const file = loaded.credentials
  const now = Date.now()
  const cookies = file.cookies.filter(
    (cookie) => cookie.expiresAt === null || cookie.expiresAt > now,
  )

  const restoredJar = new CookieJar()
  restoredJar.load(cookies)

  const sources = emptySources()
  for (const source of SOURCE_IDS) {
    const stored = file.sources[source]
    if (stored.status === 'pending') {
      sources[source] = {
        status: 'failed',
        updatedAt: stored.updatedAt,
        error: { code: 'SOURCE_DERIVATION_FAILED', message: '上次派生未完成，请重试' },
      }
      continue
    }

    sources[source] = {
      status: stored.status,
      updatedAt: stored.updatedAt,
      error: null,
    }
  }

  session = {
    username: file.username,
    password: file.password,
    user: file.user,
    authenticatedAt: file.authenticatedAt,
    cookies,
    spoc: file.spoc,
    bykc: file.bykc,
    ygdk: file.ygdk,
    sources,
  }
  sessionJar = restoredJar
  persisted = true
  startupWarning = null
}

/* -------------------------------- 基础辅助 -------------------------------- */

function markSourceExpired(source: SourceId): void {
  setSourceState(source, 'expired', {
    code: 'AUTH_EXPIRED',
    message: '登录状态已失效，请重新登录',
  })
}

/** 把重登过程中的运输层错误原样映射为 502/504。 */
function upstreamError(error: RelayError | undefined, fallback: string): RelayError {
  if (error && (error.code === 'UPSTREAM_TIMEOUT' || error.code === 'UPSTREAM_ERROR')) {
    return new RelayError(error.code, error.message || fallback, error.upstreamStatus)
  }
  return new RelayError('UPSTREAM_ERROR', fallback)
}

function requireSourceReady(source: SourceId): AuthSession {
  if (!session) throw new RelayError('AUTH_REQUIRED', '尚未登录')

  const state = session.sources[source]
  if (state.status === 'pending') {
    throw new RelayError('SOURCE_BUSY', '数据源正在派生，请稍后重试')
  }
  if (state.status !== 'ready') {
    throw new RelayError('AUTH_EXPIRED', '登录状态已失效，请重新登录')
  }

  return session
}

function snapshot(): AuthStatusResponse {
  if (sessionJar && session) session.cookies = sessionJar.serialize()

  const current = session
  const response: AuthStatusResponse = {
    authenticated: current !== null,
    user: current?.user ?? null,
    authenticatedAt: current?.authenticatedAt ?? null,
    persisted,
    deriving:
      current !== null &&
      SOURCE_IDS.some((source) => current.sources[source].status === 'pending'),
    sources: cloneSources(),
  }

  if (startupWarning !== null) response.warning = startupWarning
  return response
}

function cloneSources(): Record<SourceId, SourceState> {
  const sources = emptySources()
  if (!session) return sources

  for (const source of SOURCE_IDS) {
    const state = session.sources[source]
    sources[source] = {
      status: state.status,
      updatedAt: state.updatedAt,
      error: state.error === null ? null : { ...state.error },
    }
  }
  return sources
}

function pendingSources(): Record<SourceId, SourceState> {
  const sources = emptySources()
  for (const source of SOURCE_IDS) {
    sources[source] = { status: 'pending', updatedAt: null, error: null }
  }
  return sources
}

function setSourceState(
  source: SourceId,
  status: SourceState['status'],
  error: SourceError | null,
): void {
  if (!session) return
  session.sources[source] = {
    status,
    updatedAt: status === 'unconfigured' ? null : nowIso(),
    error,
  }
}

async function saveCurrentCredentials(): Promise<boolean> {
  if (!session) return false
  if (sessionJar) session.cookies = sessionJar.serialize()

  const sources = {} as CredentialFile['sources']
  for (const source of SOURCE_IDS) {
    const state = session.sources[source]
    sources[source] = { status: state.status, updatedAt: state.updatedAt }
  }

  return saveCredentials({
    version: 1,
    username: session.username,
    password: session.password,
    user: session.user,
    authenticatedAt: session.authenticatedAt,
    cookies: session.cookies,
    spoc: session.spoc,
    bykc: session.bykc,
    ygdk: session.ygdk,
    sources,
  })
}

function startNewGeneration(): void {
  generation += 1
  derivePromises.clear()
  reloginPromise = null
  lastReloginFailedAt = 0
  lastReloginFailureReason = null
}

function pruneAttempts(): void {
  const now = Date.now()
  for (const [id, attempt] of attempts) {
    if (now - attempt.createdAt > LOGIN_ATTEMPT_TTL_MS) attempts.delete(id)
  }
}

function readLoginInput(raw: unknown): LoginInput {
  if (!isRecord(raw)) {
    throw new RelayError('INVALID_REQUEST', '请求体必须是 JSON 对象')
  }

  const loginId = readString(raw.loginId, 128)
  if (loginId === null) {
    throw new RelayError('INVALID_REQUEST', '缺少 loginId')
  }

  return {
    loginId,
    username: readString(raw.username, 128),
    password: readSecret(raw.password, 256),
    captcha: readString(raw.captcha, 32),
  }
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length === 0 || text.length > maxLength) return null
  return text
}

/** 密码不 trim：前后空格可能是密码的一部分。 */
function readSecret(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  if (value.length === 0 || value.length > maxLength) return null
  return value
}

function nowIso(): string {
  return new Date().toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

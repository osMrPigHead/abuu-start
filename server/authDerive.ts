/**
 * 统一认证成功后的四源派生，见 docs/api.md 2.3、docs/trd-phase3.md 6.3。
 *
 * 与业务模块解耦：这里只做「拿凭据 + 校验」，不归一化业务数据，
 * 避免 authSession → authDerive → 业务模块 → authSession 的循环依赖。
 */
import { decryptResponse, encryptRequest } from './bykcCrypto.ts'
import { requestWithJar, type JarResult, type CookieJar } from './authHttp.ts'
import type { BykcCredential, SpocCredential, YgdkCredential } from './authTypes.ts'

const DERIVE_TIMEOUT_MS = 12_000

const BYXT_BASE = 'https://byxt.buaa.edu.cn/jwapp/sys/homeapp/'
const BYXT_REFERER = 'https://byxt.buaa.edu.cn'
const SPOC_BASE = 'https://spoc.buaa.edu.cn/spocnewht/'
const SPOC_REFERER = 'https://spoc.buaa.edu.cn/spocnew/common/zycskzy'
const BYKC_BASE = 'https://bykc.buaa.edu.cn/sscv/'
const BYKC_REFERER = 'https://bykc.buaa.edu.cn/system/course-select'
const BYKC_ORIGIN = 'https://bykc.buaa.edu.cn'
const YGDK_BASE = 'https://ygdk.buaa.edu.cn/api'
const YGDK_OAUTH_URL =
  'https://app.buaa.edu.cn/uc/api/oauth/index?redirect=https%3A%2F%2Fygdk.buaa.edu.cn%2F%23%2Fhome&appid=200230221144501510&state=STATE&qrcode=1'

/** docs/api.md 2.2 的 SPOC 固定查询参数，不是部署密钥。 */
const SPOC_TERM_PARAM =
  'YHrxtTavu6raCwC0/qdgYffB9evWHBkTng/XS4W6j3f/TPo02iEPSoegscDTRNzIPRG49o3RHl4JiFCXAiBkkA=='

const BYXT_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: BYXT_REFERER,
  'fetch-api': 'true',
}

/** 单源派生失败；只影响该源，不阻塞整体。 */
export class SourceDerivationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceDerivationError'
  }
}

export async function deriveByxt(jar: CookieJar): Promise<void> {
  if (await tryByxtCurrentUser(jar)) return

  // docs/api.md 2.3.1：拿不到 Cookie 时先访问一次 byxt 首页触发票据交换。
  try {
    await requestWithJar(jar, BYXT_REFERER, {}, {
      maxRedirects: 10,
      timeoutMs: DERIVE_TIMEOUT_MS,
    })
  } catch {
    // 首页兜底失败时继续重试 currentUser，最终统一按派生失败处理。
  }

  if (await tryByxtCurrentUser(jar)) return
  throw new SourceDerivationError('本研教育管理系统派生失败')
}

export async function deriveSpoc(jar: CookieJar): Promise<SpocCredential> {
  const token = await acquireSpocToken(jar)
  const roleCode = await loginSpoc(jar, token)
  await validateSpoc(jar, token, roleCode)
  return { token, roleCode }
}

export async function deriveBykc(jar: CookieJar): Promise<BykcCredential> {
  const token = await acquireBykcToken(jar)
  await validateBykc(jar, token)
  return { token }
}

export async function deriveYgdk(jar: CookieJar): Promise<YgdkCredential> {
  const code = await acquireYgdkCode(jar)
  const credential = await loginYgdk(jar, code)
  await validateYgdk(jar, credential)
  return credential
}

/* --------------------------------- byxt --------------------------------- */

async function tryByxtCurrentUser(jar: CookieJar): Promise<boolean> {
  try {
    const result = await requestWithJar(
      jar,
      new URL('api/home/currentUser.do', BYXT_BASE).toString(),
      { headers: BYXT_HEADERS },
      { maxRedirects: 10, timeoutMs: DERIVE_TIMEOUT_MS },
    )

    if (result.status < 200 || result.status >= 300) return false
    if (result.url.includes('sso.buaa.edu.cn')) return false
    if (!isRecord(result.json)) return false
    return String(result.json.code) === '0'
  } catch {
    return false
  }
}

/* --------------------------------- SPOC --------------------------------- */

async function acquireSpocToken(jar: CookieJar): Promise<string> {
  let result: JarResult
  try {
    result = await requestWithJar(jar, `${SPOC_BASE}cas`, {}, {
      maxRedirects: 8,
      timeoutMs: DERIVE_TIMEOUT_MS,
    })
  } catch {
    throw new SourceDerivationError('SPOC 派生失败')
  }

  for (const url of result.visited) {
    if (!url.includes('/spocnew/cas')) continue
    const token = readRawQueryParam(url, 'token')
    if (token !== null) return token
  }

  throw new SourceDerivationError('SPOC 派生失败')
}

async function loginSpoc(jar: CookieJar, token: string): Promise<string> {
  const result = await requestWithJar(jar, `${SPOC_BASE}sys/casLogin`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Token: `Inco-${token}`,
      Origin: 'https://spoc.buaa.edu.cn',
      Referer: SPOC_REFERER,
    },
    body: JSON.stringify({ token }),
  }, { maxRedirects: 0, timeoutMs: DERIVE_TIMEOUT_MS })

  if (result.status < 200 || result.status >= 300 || !isRecord(result.json)) {
    throw new SourceDerivationError('SPOC 派生失败')
  }
  if (Number(result.json.code) !== 200) {
    throw new SourceDerivationError('SPOC 派生失败')
  }

  const roleCode = readRoleCode(result.json.content)
  if (roleCode === null) {
    throw new SourceDerivationError('SPOC 派生失败')
  }

  return roleCode
}

async function validateSpoc(
  jar: CookieJar,
  token: string,
  roleCode: string,
): Promise<void> {
  const result = await requestWithJar(jar, `${SPOC_BASE}inco/ht/queryOne`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Token: `Inco-${token}`,
      RoleCode: roleCode,
      Origin: 'https://spoc.buaa.edu.cn',
      Referer: SPOC_REFERER,
    },
    body: JSON.stringify({ param: SPOC_TERM_PARAM }),
  }, { maxRedirects: 0, timeoutMs: DERIVE_TIMEOUT_MS })

  if (result.status < 200 || result.status >= 300 || !isRecord(result.json)) {
    throw new SourceDerivationError('SPOC 派生失败')
  }
  if (Number(result.json.code) !== 200) {
    throw new SourceDerivationError('SPOC 派生失败')
  }
}

/** RoleCode 优先级：jsdm → rolecode（字符串/数字/数组）→ jsdmList 首个非空。 */
function readRoleCode(content: unknown): string | null {
  if (!isRecord(content)) return null
  return (
    firstNonEmptyString(content.jsdm) ??
    firstNonEmptyString(content.rolecode) ??
    firstArrayString(content.jsdmList)
  )
}

/* --------------------------------- 博雅 --------------------------------- */

async function acquireBykcToken(jar: CookieJar): Promise<string> {
  const token = await findBykcToken(jar)
  if (token !== null) return token

  // docs/api.md 2.3.3：拿不到 token 时访问一次 cas-login 兜底（忽略结果）。
  try {
    await requestWithJar(jar, `${BYKC_ORIGIN}/cas-login?token=`, {}, {
      maxRedirects: 10,
      timeoutMs: DERIVE_TIMEOUT_MS,
    })
  } catch {
    // 兜底请求失败不影响最终判定。
  }

  const retried = await findBykcToken(jar)
  if (retried !== null) return retried

  throw new SourceDerivationError('博雅派生失败')
}

async function findBykcToken(jar: CookieJar): Promise<string | null> {
  let result: JarResult
  try {
    result = await requestWithJar(jar, `${BYKC_BASE}cas/login`, {}, {
      maxRedirects: 10,
      timeoutMs: DERIVE_TIMEOUT_MS,
    })
  } catch {
    return null
  }

  for (const url of result.visited) {
    const token = readRawQueryParam(url, 'token')
    if (token !== null) return token
  }

  return null
}

async function validateBykc(jar: CookieJar, token: string): Promise<void> {
  const encrypted = encryptRequest(JSON.stringify({}))

  const result = await requestWithJar(jar, `${BYKC_BASE}getUserProfile`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      Origin: BYKC_ORIGIN,
      Referer: BYKC_REFERER,
      auth_token: token,
      authtoken: token,
      ak: encrypted.ak,
      sk: encrypted.sk,
      ts: encrypted.ts,
    },
    body: encrypted.body,
  }, { maxRedirects: 0, timeoutMs: DERIVE_TIMEOUT_MS })

  if (result.status < 200 || result.status >= 300) {
    throw new SourceDerivationError('博雅派生失败')
  }

  const decoded = decryptResponse(result.text, encrypted.aesKey)
  if (decoded.includes('会话已失效') || decoded.includes('未登录')) {
    throw new SourceDerivationError('博雅派生失败')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(decoded) as unknown
  } catch {
    throw new SourceDerivationError('博雅派生失败')
  }

  if (!isRecord(parsed) || parsed.status !== '0') {
    throw new SourceDerivationError('博雅派生失败')
  }
}

/* --------------------------------- 阳光 --------------------------------- */

async function acquireYgdkCode(jar: CookieJar): Promise<string> {
  let result: JarResult
  try {
    result = await requestWithJar(jar, YGDK_OAUTH_URL, {}, {
      maxRedirects: 10,
      timeoutMs: DERIVE_TIMEOUT_MS,
    })
  } catch {
    throw new SourceDerivationError('阳光打卡派生失败')
  }

  for (const url of result.visited) {
    const code = readRawQueryParam(url, 'code')
    if (code !== null) return code
  }

  throw new SourceDerivationError('阳光打卡派生失败')
}

async function loginYgdk(jar: CookieJar, code: string): Promise<YgdkCredential> {
  const url = new URL(`${YGDK_BASE}/Front/Clockin/User/campusAppLogin`)
  url.searchParams.set('code', code)

  const result = await requestWithJar(jar, url.toString(), {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  }, { maxRedirects: 0, timeoutMs: DERIVE_TIMEOUT_MS })

  if (result.status < 200 || result.status >= 300 || !isRecord(result.json)) {
    throw new SourceDerivationError('阳光打卡派生失败')
  }
  if (Number(result.json.code) !== 1) {
    throw new SourceDerivationError('阳光打卡派生失败')
  }

  const payload = isRecord(result.json.result) ? result.json.result : {}
  const data = isRecord(payload.data) ? payload.data : payload

  const uid = readInteger(data.uid)
  const token = readRawString(data.token)
  if (uid === null || token === null) {
    throw new SourceDerivationError('阳光打卡派生失败')
  }

  return { uid, token }
}

async function validateYgdk(jar: CookieJar, credential: YgdkCredential): Promise<void> {
  const classify = await requestYgdkForm(jar, '/Front/Clockin/Classify/getList', credential)
  const list = isRecord(classify) && Array.isArray(classify.list) ? classify.list : []
  const classifyId = readClassifyId(list)

  await requestYgdkForm(jar, '/Front/Clockin/Clockin/getCount', credential, {
    classify_id: String(classifyId ?? 1),
    user_id: String(credential.uid),
  })
}

async function requestYgdkForm(
  jar: CookieJar,
  path: string,
  credential: YgdkCredential,
  form: Record<string, string> = {},
): Promise<unknown> {
  const body = new URLSearchParams(form)
  body.append('uid', String(credential.uid))
  body.append('token', credential.token)

  const result = await requestWithJar(jar, `${YGDK_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  }, { maxRedirects: 0, timeoutMs: DERIVE_TIMEOUT_MS })

  if (result.status < 200 || result.status >= 300 || !isRecord(result.json)) {
    throw new SourceDerivationError('阳光打卡派生失败')
  }
  if (Number(result.json.code) !== 1) {
    throw new SourceDerivationError('阳光打卡派生失败')
  }

  return result.json.result
}

function readClassifyId(list: unknown[]): number | null {
  for (const item of list) {
    if (!isRecord(item)) continue
    const id = readInteger(item.classify_id)
    const name = typeof item.name === 'string' ? item.name : ''
    if (id !== null && name.includes('体育')) return id
  }

  for (const item of list) {
    if (!isRecord(item)) continue
    const id = readInteger(item.classify_id)
    if (id === 1) return 1
  }

  for (const item of list) {
    if (!isRecord(item)) continue
    const id = readInteger(item.classify_id)
    if (id !== null) return id
  }

  return null
}

/* -------------------------------- 基础辅助 -------------------------------- */

/**
 * 从原始 URL 中取查询参数并做一次 URL 解码。
 * 不用 URLSearchParams：它会把 `+` 当作空格，破坏博雅/阳光 token。
 */
function readRawQueryParam(url: string, name: string): string | null {
  const match = new RegExp(`[?&]${name}=([^&#]*)`).exec(url)
  if (!match) return null

  const raw = match[1] ?? ''
  if (raw.length === 0) return null

  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function readRawString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length === 0) return null

  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function firstNonEmptyString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

function firstArrayString(value: unknown): string | null {
  if (!Array.isArray(value)) return null

  for (const item of value) {
    const text = firstNonEmptyString(item)
    if (text !== null) return text
  }

  return null
}

function readInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

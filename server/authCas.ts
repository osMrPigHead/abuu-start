/**
 * 统一认证页面解析与错误分类，见 docs/api.md 2.2 / 2.4、docs/trd-phase3.md 6.2。
 * 页面结构来自参考 B 与 docs/api.md；上游改版时需重新联调。
 */
import { RelayError } from './errors.ts'
import { requestWithJar, type CookieJar } from './authHttp.ts'
import type { AuthUser } from './authTypes.ts'
import { isTransientStatus } from './http.ts'

export const SSO_LOGIN_URL = 'https://sso.buaa.edu.cn/login'
export const SSO_LOGOUT_URL = 'https://sso.buaa.edu.cn/logout'
export const SSO_CAPTCHA_URL = 'https://sso.buaa.edu.cn/captcha'
export const UC_LOGIN_URL =
  'https://uc.buaa.edu.cn/api/login?target=https%3A%2F%2Fuc.buaa.edu.cn%2F%23%2Fuser%2Flogin'
export const UC_STATUS_URL = 'https://uc.buaa.edu.cn/api/uc/status'

const EXECUTION_PATTERN =
  /<input[^>]*name=["']execution["'][^>]*value=["']([^"']*)["']/i
const LOGIN_PAGE_PATTERN = /<input[^>]*name=["']execution["']/i
const CAPTCHA_BLOCK_PATTERN = /config\.captcha\s*=\s*\{([\s\S]*?)\}/i
const PASSWORD_EXPIRED_PATTERN = /continueForm|ignoreAndContinue|账号存在安全风险|密码过期/i

export type LoginPage = {
  execution: string | null
  captchaId: string | null
  hidden: Record<string, string>
}

export type LoginFormValues = {
  username: string
  password: string
  execution: string
  captcha: string | null
}

export function parseLoginPage(html: string): LoginPage {
  const execution = EXECUTION_PATTERN.exec(html)?.[1]?.trim() ?? null
  const captchaBlock = CAPTCHA_BLOCK_PATTERN.exec(html)?.[1] ?? ''
  const captchaId = readAttribute(captchaBlock, 'id')

  return {
    execution: execution !== null && execution.length > 0 ? execution : null,
    captchaId,
    hidden: readHiddenInputs(html),
  }
}

export function looksLikeLoginPage(html: string): boolean {
  return LOGIN_PAGE_PATTERN.test(html)
}

export function captchaUrl(captchaId: string): string {
  return `${SSO_CAPTCHA_URL}?captchaId=${encodeURIComponent(captchaId)}`
}

/** 从验证码字节生成设置页可展示的 data URL。 */
export function captchaDataUrl(contentType: string | null, data: Buffer): string {
  const type =
    contentType !== null && contentType.toLowerCase().startsWith('image/')
      ? contentType.split(';')[0]!.trim()
      : 'image/jpeg'
  return `data:${type};base64,${data.toString('base64')}`
}

/** 复制登录页 hidden 字段并覆盖必须字段，见 docs/api.md 2.2 第 3 步。 */
export function buildLoginForm(
  hidden: Record<string, string>,
  values: LoginFormValues,
): URLSearchParams {
  const form = new URLSearchParams()
  for (const [name, value] of Object.entries(hidden)) {
    if (name.length > 0) form.append(name, value)
  }

  form.set('username', values.username)
  form.set('password', values.password)
  form.set('execution', values.execution)
  form.set('_eventId', 'submit')
  form.set('submit', '登录')
  form.set('type', 'username_password')

  if (values.captcha !== null && values.captcha.length > 0) {
    form.set('captcha', values.captcha)
    form.set('captchaResponse', values.captcha)
  }

  return form
}

/** 登录失败分类，顺序见 docs/trd-phase3.md 6.2 第 5 步。 */
export function classifyLoginFailure(html: string, finalUrl: string): RelayError {
  const text = extractErrorText(html)

  if (text.length > 0 && text.includes('验证码')) {
    return new RelayError('CAPTCHA_INVALID', '验证码错误或已过期，请刷新后重试')
  }

  if (PASSWORD_EXPIRED_PATTERN.test(html)) {
    return new RelayError(
      'PASSWORD_EXPIRED',
      '密码已过期或账号存在安全风险，请先在浏览器完成处理',
    )
  }

  const exceptionMessage = readExceptionMessage(finalUrl)
  if (exceptionMessage !== null) {
    return new RelayError('UPSTREAM_ERROR', exceptionMessage.slice(0, 120))
  }

  if (text.length > 0) {
    if (/密码|账号|用户名|学号/.test(text)) {
      return new RelayError('INVALID_CREDENTIALS', '学号或密码错误')
    }
    return new RelayError('UPSTREAM_ERROR', text.slice(0, 120))
  }

  if (looksLikeLoginPage(html)) {
    return new RelayError('INVALID_CREDENTIALS', '学号或密码错误')
  }

  return new RelayError('UPSTREAM_ERROR', '统一认证登录失败，请稍后重试')
}

/** 校验 UC 会话；非 JSON、非 200、code 非 0 都视为未登录。 */
export async function fetchUcStatus(
  jar: CookieJar,
): Promise<{ ok: true; user: AuthUser } | { ok: false }> {
  const result = await requestWithJar(
    jar,
    UC_STATUS_URL,
    {
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
    },
    { maxRedirects: 0 },
  )

  if (isTransientStatus(result.status)) {
    throw new RelayError('UPSTREAM_ERROR', '统一认证服务暂时不可用', result.status)
  }
  if (result.status < 200 || result.status >= 300) return { ok: false }
  if (!isRecord(result.json) || Number(result.json.code) !== 0) return { ok: false }

  const data = result.json.data
  if (!isRecord(data)) return { ok: false }

  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const schoolid =
    typeof data.schoolid === 'string'
      ? data.schoolid.trim()
      : typeof data.username === 'string'
        ? data.username.trim()
        : ''

  if (schoolid.length === 0) return { ok: false }
  return { ok: true, user: { name: name.length > 0 ? name : schoolid, schoolid } }
}

function readHiddenInputs(html: string): Record<string, string> {
  const hidden: Record<string, string> = {}
  const inputs = html.match(/<input\b[^>]*>/gi) ?? []

  for (const tag of inputs) {
    const attributes = readAttributes(tag)
    if ((attributes.type ?? '').toLowerCase() !== 'hidden') continue

    const name = attributes.name ?? ''
    if (name.length === 0) continue
    hidden[name] = attributes.value ?? ''
  }

  return hidden
}

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(tag)) !== null) {
    const name = match[1]?.toLowerCase()
    if (!name) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    attributes[name] = decodeEntities(value)
  }

  return attributes
}

function readAttribute(block: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*:\\s*['"]([^'"]+)['"]`, 'i').exec(block)
  const value = match?.[1]?.trim() ?? ''
  return value.length > 0 ? value : null
}

/** 依次匹配 tip-text / #errorDiv / .errors 容器内的文案。 */
function extractErrorText(html: string): string {
  const patterns = [
    /<[^>]*class=["'][^"']*\btip-text\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i,
    /<[^>]*id=["']errorDiv["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i,
    /<[^>]*class=["'][^"']*\berrors?\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i,
  ]

  for (const pattern of patterns) {
    const content = pattern.exec(html)?.[1]
    if (content === undefined) continue

    const text = stripHtml(content)
    if (text.length > 0) return text
  }

  return ''
}

function readExceptionMessage(finalUrl: string): string | null {
  if (!finalUrl.includes('exception.message=')) return null

  try {
    const value = new URL(finalUrl).searchParams.get('exception.message')?.trim() ?? ''
    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gi, '&')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

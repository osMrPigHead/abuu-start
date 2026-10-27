/**
 * 认证用 HTTP 客户端：Cookie 罐 + 手动跳转，见 docs/trd-phase3.md 3.1 / 6.2。
 * 只用 Node 内置 fetch（Node 22+ 的 getSetCookie），不引入第三方 HTTP 库。
 */
import { RelayError } from './errors.ts'
import type { StoredCookie } from './authTypes.ts'

const DEFAULT_TIMEOUT_MS = 15_000
const SSO_UPGRADE_PATTERN = /^http:\/\/sso\.buaa\.edu\.cn(?::80)?(?=[/?#]|$)/i

export type JarRequestInit = {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
}

export type JarRequestOptions = {
  timeoutMs?: number
  maxRedirects?: number
  /** 仅 sso.buaa.edu.cn 的默认 HTTP 端口升级为 HTTPS，保留查询串原始编码。 */
  upgradeSsoHttp?: boolean
}

export type JarResult = {
  status: number
  url: string
  headers: Headers
  text: string
  json: unknown
  /** 本次请求访问过的 URL 与跳转目标，用于从跳转链中提取 token/code。 */
  visited: string[]
}

export type JarBinaryResult = {
  status: number
  url: string
  contentType: string | null
  data: Buffer
}

type ParsedUrl = {
  hostname: string
  pathname: string
  secure: boolean
}

/** 按 RFC 6265 语义保存与匹配 Cookie；同一实例可被四源共享。 */
export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>()

  load(cookies: readonly StoredCookie[]): void {
    this.cookies.clear()
    for (const cookie of cookies) {
      this.cookies.set(cookieKey(cookie), { ...cookie })
    }
  }

  serialize(): StoredCookie[] {
    this.pruneExpired()
    return [...this.cookies.values()].map((cookie) => ({ ...cookie }))
  }

  clear(): void {
    this.cookies.clear()
  }

  headerFor(url: string): string {
    const parsed = parseUrl(url)
    if (!parsed) return ''

    this.pruneExpired()

    const pairs: string[] = []
    for (const cookie of this.cookies.values()) {
      if (!matchesRequest(cookie, parsed)) continue
      pairs.push(`${cookie.name}=${cookie.value}`)
    }
    return pairs.join('; ')
  }

  applySetCookie(requestUrl: string, headers: Headers): void {
    const parsed = parseUrl(requestUrl)
    if (!parsed) return

    for (const header of readSetCookie(headers)) {
      const cookie = parseSetCookie(header, parsed)
      if (cookie) this.store(cookie)
    }
  }

  private store(cookie: StoredCookie): void {
    if (cookie.expiresAt !== null && cookie.expiresAt <= Date.now()) {
      this.cookies.delete(cookieKey(cookie))
      return
    }
    this.cookies.set(cookieKey(cookie), cookie)
  }

  private pruneExpired(): void {
    const now = Date.now()
    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt !== null && cookie.expiresAt <= now) this.cookies.delete(key)
    }
  }
}

export async function requestWithJar(
  jar: CookieJar,
  url: string,
  init: JarRequestInit = {},
  options: JarRequestOptions = {},
): Promise<JarResult> {
  const { response, finalUrl, visited } = await follow(jar, url, init, options)
  const text = await response.text()

  return {
    status: response.status,
    url: finalUrl,
    headers: response.headers,
    text,
    json: parseJson(text),
    visited,
  }
}

export async function downloadWithJar(
  jar: CookieJar,
  url: string,
  init: JarRequestInit = {},
  options: JarRequestOptions = {},
): Promise<JarBinaryResult> {
  const { response, finalUrl } = await follow(jar, url, init, options)
  const data = Buffer.from(await response.arrayBuffer())

  return {
    status: response.status,
    url: finalUrl,
    contentType: response.headers.get('content-type'),
    data,
  }
}

async function follow(
  jar: CookieJar,
  url: string,
  init: JarRequestInit,
  options: JarRequestOptions,
): Promise<{ response: Response; finalUrl: string; visited: string[] }> {
  const maxRedirects = options.maxRedirects ?? 0
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let currentUrl = url
  let method = init.method ?? 'GET'
  let body = init.body
  const visited: string[] = [currentUrl]

  for (let hop = 0; ; hop += 1) {
    const headers = new Headers(init.headers)
    const cookie = jar.headerFor(currentUrl)
    if (cookie.length > 0) headers.set('Cookie', cookie)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetch(currentUrl, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch {
      if (controller.signal.aborted) {
        throw new RelayError('UPSTREAM_TIMEOUT', '上游请求超时')
      }
      throw new RelayError('UPSTREAM_ERROR', '上游请求失败')
    } finally {
      clearTimeout(timer)
    }

    jar.applySetCookie(currentUrl, response.headers)

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: currentUrl, visited }
    }

    const location = response.headers.get('location')
    if (!location) return { response, finalUrl: currentUrl, visited }

    if (hop >= maxRedirects) {
      await discardBody(response)
      throw new RelayError('UPSTREAM_ERROR', '上游跳转次数过多')
    }

    await discardBody(response)

    currentUrl = resolveLocation(currentUrl, location)
    if (options.upgradeSsoHttp) currentUrl = upgradeSsoUrl(currentUrl)
    visited.push(currentUrl)

    // 登录票据链后续跳转一律 GET，与浏览器/参考实现一致。
    method = 'GET'
    body = undefined
  }
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // 丢弃响应体失败不影响后续跳转。
  }
}

function resolveLocation(base: string, location: string): string {
  try {
    return new URL(location, base).toString()
  } catch {
    throw new RelayError('UPSTREAM_ERROR', '上游跳转地址不合法')
  }
}

/** 仅升级 sso.buaa.edu.cn 的默认 HTTP 端口，其他地址不擅自改写。 */
function upgradeSsoUrl(url: string): string {
  const match = url.match(SSO_UPGRADE_PATTERN)
  if (!match) return url
  return `https://sso.buaa.edu.cn${url.slice(match[0].length)}`
}

function readSetCookie(headers: Headers): string[] {
  const candidate = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof candidate.getSetCookie === 'function') {
    const list = candidate.getSetCookie()
    if (list.length > 0) return list
  }

  const combined = headers.get('set-cookie')
  return combined ? [combined] : []
}

function parseSetCookie(header: string, origin: ParsedUrl): StoredCookie | null {
  const segments = header.split(';')
  const pair = segments[0]?.trim() ?? ''
  const separator = pair.indexOf('=')
  if (separator <= 0) return null

  const name = pair.slice(0, separator).trim()
  const value = pair.slice(separator + 1)
  if (name.length === 0) return null

  let domain: string | null = null
  let path: string | null = null
  let maxAge: number | null = null
  let expires: number | null = null
  let secure = false
  let httpOnly = false

  for (const segment of segments.slice(1)) {
    const trimmed = segment.trim()
    const index = trimmed.indexOf('=')
    const key = (index === -1 ? trimmed : trimmed.slice(0, index)).trim().toLowerCase()
    const attribute = index === -1 ? '' : trimmed.slice(index + 1).trim()

    switch (key) {
      case 'domain':
        domain = attribute.length > 0 ? attribute.toLowerCase().replace(/^\./, '') : null
        break
      case 'path':
        path = attribute.startsWith('/') ? attribute : null
        break
      case 'max-age': {
        const seconds = Number(attribute)
        if (Number.isFinite(seconds)) maxAge = seconds
        break
      }
      case 'expires': {
        const parsed = Date.parse(attribute)
        if (!Number.isNaN(parsed)) expires = parsed
        break
      }
      case 'secure':
        secure = true
        break
      case 'httponly':
        httpOnly = true
        break
      default:
        break
    }
  }

  let hostOnly = true
  let resolvedDomain = origin.hostname
  if (domain !== null) {
    if (!domainMatches(origin.hostname, domain)) return null
    resolvedDomain = domain
    hostOnly = false
  }

  let expiresAt: number | null = null
  if (maxAge !== null) {
    expiresAt = maxAge <= 0 ? 0 : Date.now() + maxAge * 1000
  } else if (expires !== null) {
    expiresAt = expires
  }

  return {
    name,
    value,
    domain: resolvedDomain,
    path: path ?? defaultPath(origin.pathname),
    expiresAt,
    secure,
    httpOnly,
    hostOnly,
  }
}

function cookieKey(cookie: Pick<StoredCookie, 'domain' | 'path' | 'name'>): string {
  return `${cookie.domain}|${cookie.path}|${cookie.name}`
}

function defaultPath(pathname: string): string {
  if (pathname.length === 0 || pathname === '/') return '/'
  const index = pathname.lastIndexOf('/')
  return index <= 0 ? '/' : pathname.slice(0, index)
}

function parseUrl(url: string): ParsedUrl | null {
  try {
    const parsed = new URL(url)
    return {
      hostname: parsed.hostname.toLowerCase(),
      pathname: parsed.pathname.length > 0 ? parsed.pathname : '/',
      secure: parsed.protocol === 'https:',
    }
  } catch {
    return null
  }
}

function matchesRequest(cookie: StoredCookie, request: ParsedUrl): boolean {
  if (!domainMatches(request.hostname, cookie.domain, cookie.hostOnly)) return false
  if (!pathMatches(request.pathname, cookie.path)) return false
  if (cookie.secure && !request.secure) return false
  return true
}

function domainMatches(hostname: string, domain: string, hostOnly = false): boolean {
  if (hostname === domain) return true
  if (hostOnly) return false
  return hostname.endsWith(`.${domain}`)
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true
  if (!requestPath.startsWith(cookiePath)) return false
  return cookiePath.endsWith('/') || requestPath.charAt(cookiePath.length) === '/'
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

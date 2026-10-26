import { RelayError } from './errors.ts'

/** 单次上游请求超时，见 docs/trd.md 3.3。 */
const UPSTREAM_TIMEOUT_MS = 15_000

export type UpstreamResult = {
  status: number
  contentType: string | null
  text: string
  /** JSON.parse 失败时为 undefined；JSON 的 null 仍是有效值。 */
  json: unknown
}

/**
 * 发起一次上游请求。
 * - 固定 15 秒超时；
 * - redirect: "manual"，3xx 由调用方按认证失效处理；
 * - 读取完整文本，便于识别 HTML 登录页。
 */
export async function fetchUpstream(url: string, init: RequestInit = {}): Promise<UpstreamResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    })
    const text = await response.text()

    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      text,
      json: parseJson(text),
    }
  } catch {
    if (controller.signal.aborted) {
      throw new RelayError('UPSTREAM_TIMEOUT', '上游请求超时')
    }
    throw new RelayError('UPSTREAM_ERROR', '上游请求失败')
  } finally {
    clearTimeout(timer)
  }
}

export function requireJson<T>(result: UpstreamResult): T {
  if (result.json === undefined) {
    throw new RelayError('BAD_RESPONSE', '上游返回了非 JSON 响应', result.status)
  }
  return result.json as T
}

export function looksLikeHtml(text: string): boolean {
  return text.trimStart().startsWith('<')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

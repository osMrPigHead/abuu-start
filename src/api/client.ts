import type { ApiErrorCode, ErrorEnvelope, RelayErrorCode } from '@/types'

type RequestOptions = {
  headers?: HeadersInit
  signal?: AbortSignal
}

const RELAY_ERROR_CODES: readonly RelayErrorCode[] = [
  'NO_CREDENTIAL',
  'AUTH_EXPIRED',
  'INVALID_REQUEST',
  'INVALID_WEEK',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'BAD_RESPONSE',
  'INTERNAL',
]

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly upstreamStatus: number | undefined

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    upstreamStatus?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.upstreamStatus = upstreamStatus
  }
}

/**
 * 前端唯一的 fetch 入口。
 * - 固定 GET，不缓存；
 * - 网络失败、非 JSON 响应统一映射为 RELAY_UNREACHABLE；
 * - 错误响应解析为 ApiError，不打印日志。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: 'GET',
    cache: 'no-store',
  }

  if (options.headers) init.headers = options.headers
  if (options.signal) init.signal = options.signal

  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    if (options.signal?.aborted) {
      throw new ApiError('RELAY_UNREACHABLE', '请求已取消', 0)
    }
    throw new ApiError(
      'RELAY_UNREACHABLE',
      '无法连接本地中继，请确认 npm run dev 已启动',
      0,
    )
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new ApiError('RELAY_UNREACHABLE', '本地中继返回了非 JSON 响应', response.status)
  }

  let body: unknown
  try {
    body = (await response.json()) as unknown
  } catch {
    throw new ApiError('RELAY_UNREACHABLE', '本地中继返回了无法解析的响应', response.status)
  }

  if (!response.ok) {
    const envelope = readErrorEnvelope(body)
    if (envelope) {
      throw new ApiError(
        envelope.error.code,
        envelope.error.message,
        response.status,
        envelope.error.upstreamStatus,
      )
    }

    throw new ApiError('RELAY_UNREACHABLE', `请求失败（HTTP ${response.status}）`, response.status)
  }

  return body as T
}

function readErrorEnvelope(body: unknown): ErrorEnvelope | null {
  if (typeof body !== 'object' || body === null) return null

  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return null

  const candidate = error as {
    code?: unknown
    message?: unknown
    upstreamStatus?: unknown
  }

  if (typeof candidate.code !== 'string' || !isRelayErrorCode(candidate.code)) return null
  if (typeof candidate.message !== 'string') return null

  const envelope: ErrorEnvelope = {
    error: {
      code: candidate.code,
      message: candidate.message,
    },
  }

  if (typeof candidate.upstreamStatus === 'number') {
    envelope.error.upstreamStatus = candidate.upstreamStatus
  }

  return envelope
}

function isRelayErrorCode(value: string): value is RelayErrorCode {
  return (RELAY_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * 中继统一错误码与 HTTP 状态映射。
 * 文案与状态见 docs/trd.md 3.1。
 */
export type RelayErrorCode =
  | 'NO_CREDENTIAL'
  | 'AUTH_EXPIRED'
  | 'INVALID_REQUEST'
  | 'INVALID_WEEK'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'BAD_RESPONSE'
  | 'INTERNAL'

const HTTP_STATUS: Record<RelayErrorCode, number> = {
  NO_CREDENTIAL: 401,
  AUTH_EXPIRED: 401,
  INVALID_REQUEST: 400,
  INVALID_WEEK: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
  BAD_RESPONSE: 502,
  INTERNAL: 500,
}

export class RelayError extends Error {
  readonly code: RelayErrorCode
  readonly upstreamStatus: number | undefined

  constructor(code: RelayErrorCode, message: string, upstreamStatus?: number) {
    super(message)
    this.name = 'RelayError'
    this.code = code
    this.upstreamStatus = upstreamStatus
  }

  get status(): number {
    return HTTP_STATUS[this.code]
  }
}

export type RelayErrorBody = {
  error: {
    code: RelayErrorCode
    message: string
    upstreamStatus?: number
  }
}

export function toRelayError(error: unknown): RelayError {
  if (error instanceof RelayError) return error
  return new RelayError('INTERNAL', '本地中继内部错误')
}

export function toErrorBody(error: RelayError): RelayErrorBody {
  const body: RelayErrorBody = {
    error: {
      code: error.code,
      message: error.message,
    },
  }

  if (error.upstreamStatus !== undefined) {
    body.error.upstreamStatus = error.upstreamStatus
  }

  return body
}

/**
 * 中继错误类型与 HTTP 状态映射。
 * 错误码与错误信封见 shared/errors.ts；文案与状态见 docs/trd.md 3.1、docs/trd-phase3.md 3.1。
 */
import type { ErrorEnvelope, RelayErrorCode } from "../../shared/errors.ts";

const HTTP_STATUS: Record<RelayErrorCode, number> = {
  NO_CREDENTIAL: 401,
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  CAPTCHA_REQUIRED: 401,
  CAPTCHA_INVALID: 401,
  PASSWORD_EXPIRED: 403,
  AUTH_EXPIRED: 401,
  LOGIN_IN_PROGRESS: 409,
  SOURCE_UNKNOWN: 400,
  SOURCE_BUSY: 409,
  INVALID_REQUEST: 400,
  INVALID_WEEK: 400,
  INVALID_PAGE: 400,
  INVALID_PATH: 400,
  PATH_UNAVAILABLE: 422,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  FORBIDDEN_ORIGIN: 403,
  UNSUPPORTED_MEDIA: 415,
  PAYLOAD_TOO_LARGE: 413,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
  BAD_RESPONSE: 502,
  INTERNAL: 500,
};

export class RelayError extends Error {
  readonly code: RelayErrorCode;
  readonly upstreamStatus: number | undefined;

  constructor(code: RelayErrorCode, message: string, upstreamStatus?: number) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}

export function toRelayError(error: unknown): RelayError {
  if (error instanceof RelayError) return error;
  return new RelayError("INTERNAL", "本地中继内部错误");
}

/** 把重登过程中的运输层错误原样映射为 502/504；其余包裹为 UPSTREAM_ERROR。 */
export function toUpstreamRelayError(
  error: RelayError | undefined,
  fallback: string,
): RelayError {
  if (
    error &&
    (error.code === "UPSTREAM_TIMEOUT" || error.code === "UPSTREAM_ERROR")
  ) {
    return new RelayError(
      error.code,
      error.message || fallback,
      error.upstreamStatus,
    );
  }
  return new RelayError("UPSTREAM_ERROR", fallback);
}

export function toErrorBody(error: RelayError): ErrorEnvelope {
  const body: ErrorEnvelope = {
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (error.upstreamStatus !== undefined) {
    body.error.upstreamStatus = error.upstreamStatus;
  }

  return body;
}

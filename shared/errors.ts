/**
 * 中继统一错误码与错误信封，文案与 HTTP 状态映射见 docs/trd.md 3.1、docs/trd-phase3.md 3.1。
 * 前端只读错误码，HTTP 状态映射属于中继实现。
 */

export const RELAY_ERROR_CODES = [
  "NO_CREDENTIAL",
  "AUTH_REQUIRED",
  "INVALID_CREDENTIALS",
  "CAPTCHA_REQUIRED",
  "CAPTCHA_INVALID",
  "PASSWORD_EXPIRED",
  "AUTH_EXPIRED",
  "LOGIN_IN_PROGRESS",
  "SOURCE_UNKNOWN",
  "SOURCE_BUSY",
  "INVALID_REQUEST",
  "INVALID_WEEK",
  "INVALID_PAGE",
  "INVALID_PATH",
  "PATH_UNAVAILABLE",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "FORBIDDEN_ORIGIN",
  "UNSUPPORTED_MEDIA",
  "PAYLOAD_TOO_LARGE",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_ERROR",
  "BAD_RESPONSE",
  "INTERNAL",
] as const;

export type RelayErrorCode = (typeof RELAY_ERROR_CODES)[number];

export type ErrorEnvelope = {
  error: {
    code: RelayErrorCode;
    message: string;
    upstreamStatus?: number;
  };
};

export function isRelayErrorCode(value: string): value is RelayErrorCode {
  return (RELAY_ERROR_CODES as readonly string[]).includes(value);
}

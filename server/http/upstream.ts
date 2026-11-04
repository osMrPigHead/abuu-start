import { isRecord } from "../core/guards.ts";
import { RelayError } from "../core/errors.ts";
import { fetchWithTimeout } from "./fetch.ts";

/** 单次上游请求超时，见 docs/trd.md 3.3。 */
const UPSTREAM_TIMEOUT_MS = 15_000;

/** 上游 JSON 响应；auth/http.ts 的 JarResult 也可直接传入 readEnvelope。 */
export type UpstreamResult = {
  status: number;
  contentType?: string | null;
  text: string;
  /** JSON.parse 失败时为 undefined；JSON 的 null 仍是有效值。 */
  json: unknown;
};

/** 各源业务信封的差异点：成功码、payload 字段、消息字段与认证判定。 */
export type EnvelopeRule<T> = {
  label: string;
  /** 业务码字段名，默认 code。 */
  codeKey?: string;
  isSuccess: (code: unknown) => boolean;
  read: (json: Record<string, unknown>) => T;
  /** 消息字段名，默认 msg。 */
  messageKey?: string;
  /** 认证失效的错误码（如阳光 -98）。 */
  isAuthFailure?: (code: unknown) => boolean;
  authPattern?: RegExp;
  authMessage: string;
  /** 认证分支只返回固定 authMessage，不拼接上游文案（博雅）。 */
  useAuthMessageOnly?: boolean;
  badResponseMessage?: string;
  businessMessage?: string;
};

/**
 * 发起一次上游请求。
 * - 固定 15 秒超时；
 * - redirect: "manual"，3xx 由调用方按认证失效处理；
 * - 读取完整文本，便于识别 HTML 登录页。
 */
export async function fetchUpstream(
  url: string,
  init: RequestInit = {},
): Promise<UpstreamResult> {
  const response = await fetchWithTimeout(
    url,
    { ...init, redirect: "manual" },
    UPSTREAM_TIMEOUT_MS,
  );

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new RelayError("UPSTREAM_ERROR", "上游请求失败");
  }

  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    text,
    json: parseJson(text),
  };
}

/**
 * 校验 2xx 响应里的业务信封：成功码 → payload；认证码/认证文案 → AUTH_EXPIRED；
 * 其余业务码 → UPSTREAM_ERROR。非对象响应统一 BAD_RESPONSE。
 */
export function readEnvelope<T>(
  result: UpstreamResult,
  rule: EnvelopeRule<T>,
): T {
  if (!isRecord(result.json)) {
    throw new RelayError(
      "BAD_RESPONSE",
      rule.badResponseMessage ?? `${rule.label}上游返回了无法识别的响应`,
      result.status,
    );
  }

  const envelope = result.json;
  const code = envelope[rule.codeKey ?? "code"];

  if (rule.isAuthFailure?.(code)) {
    throw new RelayError("AUTH_EXPIRED", rule.authMessage, result.status);
  }
  if (rule.isSuccess(code)) return rule.read(envelope);

  const rawMessage = envelope[rule.messageKey ?? "msg"];
  const message = typeof rawMessage === "string" ? rawMessage : "";

  if (rule.authPattern?.test(message)) {
    throw new RelayError(
      "AUTH_EXPIRED",
      rule.useAuthMessageOnly ? rule.authMessage : message || rule.authMessage,
      result.status,
    );
  }

  throw new RelayError(
    "UPSTREAM_ERROR",
    message || rule.businessMessage || `${rule.label}上游返回业务错误`,
    result.status,
  );
}

export function looksLikeHtml(text: string): boolean {
  return text.trimStart().startsWith("<");
}

/** 408/429/5xx 视为上游暂时不可用，不是认证失效。 */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

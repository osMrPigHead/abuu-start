/**
 * SPOC 协议层：请求构造与业务信封读取，见 docs/api.md 2。
 * 只描述请求、不直接发送；Token/RoleCode 由调用方提供。
 */
import { RelayError } from "../core/errors.ts";
import {
  fetchUpstream,
  isTransientStatus,
  looksLikeHtml,
  readEnvelope,
  type UpstreamResult,
} from "../http/upstream.ts";
import type { BuiltRequest } from "./types.ts";
import { SPOC_BASE_URL, SPOC_ORIGIN, SPOC_REFERER_URL } from "./urls.ts";

export type SpocCredentials = {
  token: string;
  roleCode?: string;
};

export type SpocRequest = {
  method?: "GET" | "POST";
  query?: URLSearchParams;
  body?: unknown;
};

export function buildSpocRequest(
  credentials: SpocCredentials,
  path: string,
  request: SpocRequest = {},
): BuiltRequest {
  const url = new URL(path, SPOC_BASE_URL);
  if (request.query) url.search = request.query.toString();

  const method = request.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    Token: credentials.token,
    "X-Requested-With": "XMLHttpRequest",
    Referer: SPOC_REFERER_URL,
  };
  if (credentials.roleCode !== undefined) {
    headers.RoleCode = credentials.roleCode;
  }

  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/json;charset=UTF-8";
    headers.Origin = SPOC_ORIGIN;
    body = JSON.stringify(request.body ?? {});
  }

  return { url: url.toString(), init: { method, headers, body } };
}

/** 读取 SPOC 信封：3xx/HTML 视为认证失效，非 JSON 视为坏响应，业务码非 200 视为上游错误。 */
export function readSpocEnvelope<T>(result: UpstreamResult): T {
  if (isTransientStatus(result.status)) {
    throw new RelayError("UPSTREAM_ERROR", "SPOC 暂时不可用", result.status);
  }

  if (result.status >= 300 && result.status < 400) {
    throw new RelayError("AUTH_EXPIRED", "SPOC 登录状态已失效", result.status);
  }

  if (result.status < 200 || result.status >= 300) {
    if (looksLikeHtml(result.text)) {
      throw new RelayError(
        "AUTH_EXPIRED",
        "SPOC 登录状态已失效",
        result.status,
      );
    }
    throw new RelayError("UPSTREAM_ERROR", "SPOC 上游请求失败", result.status);
  }

  if (result.json === undefined) {
    if (looksLikeHtml(result.text)) {
      throw new RelayError(
        "AUTH_EXPIRED",
        "SPOC 登录状态已失效",
        result.status,
      );
    }
    throw new RelayError(
      "BAD_RESPONSE",
      "SPOC 上游返回了非 JSON 响应",
      result.status,
    );
  }

  return readEnvelope<T>(result, {
    label: "SPOC",
    isSuccess: (code) => Number(code) === 200,
    read: (json) => json.content as T,
    authPattern: /登录|token|未认证|未登录|权限/i,
    authMessage: "SPOC 登录状态已失效",
    badResponseMessage: "SPOC 上游返回了无法识别的响应",
    businessMessage: "SPOC 上游返回业务错误",
  });
}

export async function fetchSpoc<T>(
  credentials: SpocCredentials,
  path: string,
  request: SpocRequest = {},
): Promise<T> {
  const built = buildSpocRequest(credentials, path, request);
  const result = await fetchUpstream(built.url, built.init);
  return readSpocEnvelope<T>(result);
}

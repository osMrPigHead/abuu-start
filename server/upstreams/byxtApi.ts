/**
 * byxt 协议层：请求构造与业务信封读取，见 docs/api.md 1。
 * 只描述请求、不直接发送；Cookie 由调用方补齐（业务用 fetch，派生用 Cookie 罐）。
 */
import { RelayError } from "../core/errors.ts";
import { isRecord } from "../core/guards.ts";
import {
  fetchUpstream,
  isTransientStatus,
  looksLikeHtml,
  readEnvelope,
  type UpstreamResult,
} from "../http/upstream.ts";
import type { BuiltRequest } from "./types.ts";
import { BYXT_BASE_URL, BYXT_REFERER_URL } from "./urls.ts";

export type ByxtRequest = {
  method?: "GET" | "POST";
  query?: URLSearchParams;
  form?: URLSearchParams;
};

function byxtHeaders(): Record<string, string> {
  return {
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    Referer: BYXT_REFERER_URL,
    "fetch-api": "true",
  };
}

export function buildByxtRequest(
  path: string,
  request: ByxtRequest = {},
): BuiltRequest {
  const url = new URL(path, BYXT_BASE_URL);
  if (request.query) url.search = request.query.toString();

  const method = request.method ?? "GET";
  const headers = byxtHeaders();
  let body: string | undefined;

  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    body = request.form?.toString() ?? "";
  }

  return { url: url.toString(), init: { method, headers, body } };
}

/** 读取业务信封：transient → 502；非 2xx/HTML/非 JSON → 认证失效；业务码非 0 → 上游错误。 */
export function readByxtEnvelope<T>(result: UpstreamResult): T {
  if (isTransientStatus(result.status)) {
    throw new RelayError(
      "UPSTREAM_ERROR",
      "本研教育管理系统暂时不可用",
      result.status,
    );
  }

  if (result.status < 200 || result.status >= 300) {
    throw new RelayError("AUTH_EXPIRED", "登录状态已失效", result.status);
  }

  const contentType = result.contentType?.toLowerCase() ?? "";
  if (
    !contentType.includes("json") ||
    looksLikeHtml(result.text) ||
    result.json === undefined
  ) {
    throw new RelayError("AUTH_EXPIRED", "登录状态已失效", result.status);
  }

  return readEnvelope<T>(result, {
    label: "本研教育管理系统",
    isSuccess: (code) => String(code) === "0",
    read: (json) => json.datas as T,
    authPattern: /登录|认证|会话|token/i,
    authMessage: "登录状态已失效",
    badResponseMessage: "上游返回了无法识别的响应",
    businessMessage: "上游返回业务错误",
  });
}

/** 派生校验用：只判断 2xx 响应是否为成功信封，不抛错。 */
export function isByxtSuccess(result: UpstreamResult): boolean {
  return isRecord(result.json) && String(result.json.code) === "0";
}

/** 业务侧调用：注入 Cookie 后走无 Cookie 罐的 fetch 客户端。 */
export async function fetchByxt<T>(
  cookie: string,
  path: string,
  request: ByxtRequest = {},
): Promise<T> {
  const built = buildByxtRequest(path, request);
  built.init.headers.Cookie = cookie;

  const result = await fetchUpstream(built.url, built.init);
  return readByxtEnvelope<T>(result);
}

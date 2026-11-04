/**
 * 阳光打卡协议层：表单请求构造与 `{ code, result }` 信封读取，见 docs/api.md 4。
 * 只描述请求、不直接发送；uid/token 由调用方提供。
 */
import { RelayError } from "../core/errors.ts";
import { isRecord, readInteger } from "../core/guards.ts";
import { fetchUpstream, type UpstreamResult } from "../http/upstream.ts";
import type { BuiltRequest } from "./types.ts";
import { YGDK_BASE_URL } from "./urls.ts";

export type YgdkCredentials = {
  uid: string;
  token: string;
};

export function buildYgdkForm(
  credentials: YgdkCredentials,
  path: string,
  form: Record<string, string> = {},
): BuiltRequest {
  const body = new URLSearchParams(form);
  body.append("uid", credentials.uid);
  body.append("token", credentials.token);

  return {
    url: `${YGDK_BASE_URL}${path}`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body.toString(),
    },
  };
}

/** 读取阳光信封：非 2xx → 上游错误；非 JSON → 坏响应；code -98 → 认证失效。 */
export function readYgdkResult(result: UpstreamResult): unknown {
  if (result.status < 200 || result.status >= 300) {
    throw new RelayError(
      "UPSTREAM_ERROR",
      "阳光打卡上游请求失败",
      result.status,
    );
  }

  if (!isRecord(result.json)) {
    throw new RelayError(
      "BAD_RESPONSE",
      "阳光打卡上游返回了非 JSON 响应",
      result.status,
    );
  }

  const code = readInteger(result.json.code);
  if (code === -98) {
    throw new RelayError(
      "AUTH_EXPIRED",
      "阳光打卡登录状态已失效",
      result.status,
    );
  }

  if (code !== 1) {
    const message =
      typeof result.json.msg === "string" ? result.json.msg.trim() : "";
    throw new RelayError(
      "UPSTREAM_ERROR",
      message || "阳光打卡上游返回业务错误",
      result.status,
    );
  }

  return result.json.result;
}

export async function fetchYgdk(
  credentials: YgdkCredentials,
  path: string,
  form: Record<string, string> = {},
): Promise<unknown> {
  const built = buildYgdkForm(credentials, path, form);
  const result = await fetchUpstream(built.url, built.init);
  return readYgdkResult(result);
}

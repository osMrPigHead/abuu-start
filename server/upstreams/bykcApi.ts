/**
 * 博雅协议层：RSA/AES 加密请求构造与解密后的信封读取，见 docs/api.md 3。
 * 只描述请求、不直接发送；业务与派生各自选择传输方式。
 */
import { RelayError } from "../core/errors.ts";
import { isRecord } from "../core/guards.ts";
import {
  fetchUpstream,
  isTransientStatus,
  readEnvelope,
  type UpstreamResult,
} from "../http/upstream.ts";
import { decryptResponse, encryptRequest } from "./bykcCrypto.ts";
import type { BuiltRequest } from "./types.ts";
import { BYKC_BASE_URL, BYKC_ORIGIN, BYKC_REFERER_URL } from "./urls.ts";

export type BykcCall = BuiltRequest & {
  /** 解密响应所需的会话密钥。 */
  aesKey: Buffer;
};

export function buildBykcCall(
  token: string,
  apiName: string,
  payload: unknown,
): BykcCall {
  const encrypted = encryptRequest(JSON.stringify(payload));

  return {
    url: `${BYKC_BASE_URL}${apiName}`,
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json;charset=UTF-8",
        Origin: BYKC_ORIGIN,
        Referer: BYKC_REFERER_URL,
        auth_token: token,
        authtoken: token,
        ak: encrypted.ak,
        sk: encrypted.sk,
        ts: encrypted.ts,
      },
      body: encrypted.body,
    },
    aesKey: encrypted.aesKey,
  };
}

function parseDecodedPayload(
  decoded: string,
  status: number,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded) as unknown;
  } catch {
    throw new RelayError(
      "BAD_RESPONSE",
      "博雅上游返回了无法解析的响应",
      status,
    );
  }

  if (!isRecord(parsed)) {
    throw new RelayError("BAD_RESPONSE", "博雅上游返回了异常响应", status);
  }

  return parsed;
}

/** 解密并读取博雅信封；会话失效文案、业务码非 0 分别映射为认证/上游错误。 */
export function readBykcPayload(
  result: UpstreamResult,
  aesKey: Buffer,
): unknown {
  if (isTransientStatus(result.status)) {
    throw new RelayError("UPSTREAM_ERROR", "博雅课程暂时不可用", result.status);
  }

  if (result.status < 200 || result.status >= 300) {
    throw new RelayError("AUTH_EXPIRED", "博雅登录状态已失效", result.status);
  }

  const decoded = decryptResponse(result.text, aesKey);
  if (decoded.includes("会话已失效") || decoded.includes("未登录")) {
    throw new RelayError("AUTH_EXPIRED", "博雅登录状态已失效", result.status);
  }

  const parsed = parseDecodedPayload(decoded, result.status);

  return readEnvelope<unknown>(
    { status: result.status, text: result.text, json: parsed },
    {
      label: "博雅",
      codeKey: "status",
      isSuccess: (code) => code === "0",
      read: (json) => json.data,
      messageKey: "errmsg",
      authPattern: /登录|会话|未登录|认证/,
      authMessage: "博雅登录状态已失效",
      useAuthMessageOnly: true,
      badResponseMessage: "博雅上游返回了异常响应",
      businessMessage: "博雅上游返回业务错误",
    },
  );
}

/** 业务侧调用：加密请求 → fetch → 解密并拆信封。 */
export async function callBykc(
  token: string,
  apiName: string,
  payload: unknown,
): Promise<unknown> {
  const call = buildBykcCall(token, apiName, payload);
  const result = await fetchUpstream(call.url, call.init);
  return readBykcPayload(result, call.aesKey);
}

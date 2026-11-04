/**
 * 认证用 HTTP 客户端：Cookie 罐 + 手动跳转，见 docs/trd.md 3.1 / 6.2。
 * Cookie 解析与匹配在 auth/cookieJar.ts；本模块只负责跳转与响应读取。
 */
import { RelayError } from "../core/errors.ts";
import { parseJson } from "../core/json.ts";
import { fetchWithTimeout } from "../http/fetch.ts";
import type { CookieJar } from "./cookieJar.ts";

const DEFAULT_TIMEOUT_MS = 15_000;
const SSO_UPGRADE_PATTERN = /^http:\/\/sso\.buaa\.edu\.cn(?::80)?(?=[/?#]|$)/i;

export type JarRequestInit = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
};

export type JarRequestOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  /** 仅 sso.buaa.edu.cn 的默认 HTTP 端口升级为 HTTPS，保留查询串原始编码。 */
  upgradeSsoHttp?: boolean;
};

export type JarResult = {
  status: number;
  url: string;
  headers: Headers;
  text: string;
  json: unknown;
  /** 本次请求访问过的 URL 与跳转目标，用于从跳转链中提取 token/code。 */
  visited: string[];
};

export type JarBinaryResult = {
  status: number;
  url: string;
  contentType: string | null;
  data: Buffer;
};

export async function requestWithJar(
  jar: CookieJar,
  url: string,
  init: JarRequestInit = {},
  options: JarRequestOptions = {},
): Promise<JarResult> {
  const { response, finalUrl, visited } = await follow(jar, url, init, options);
  const text = await response.text();

  return {
    status: response.status,
    url: finalUrl,
    headers: response.headers,
    text,
    json: parseJson(text),
    visited,
  };
}

export async function downloadWithJar(
  jar: CookieJar,
  url: string,
  init: JarRequestInit = {},
  options: JarRequestOptions = {},
): Promise<JarBinaryResult> {
  const { response, finalUrl } = await follow(jar, url, init, options);
  const data = Buffer.from(await response.arrayBuffer());

  return {
    status: response.status,
    url: finalUrl,
    contentType: response.headers.get("content-type"),
    data,
  };
}

async function follow(
  jar: CookieJar,
  url: string,
  init: JarRequestInit,
  options: JarRequestOptions,
): Promise<{ response: Response; finalUrl: string; visited: string[] }> {
  const maxRedirects = options.maxRedirects ?? 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let currentUrl = url;
  let method = init.method ?? "GET";
  let body = init.body;
  const visited: string[] = [currentUrl];

  for (let hop = 0; ; hop += 1) {
    const headers = new Headers(init.headers);
    const cookie = jar.headerFor(currentUrl);
    if (cookie.length > 0) headers.set("Cookie", cookie);

    const response = await fetchWithTimeout(
      currentUrl,
      { method, headers, body, redirect: "manual" },
      timeoutMs,
    );

    jar.applySetCookie(currentUrl, response.headers);

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: currentUrl, visited };
    }

    const location = response.headers.get("location");
    if (!location) return { response, finalUrl: currentUrl, visited };

    if (hop >= maxRedirects) {
      await discardBody(response);
      throw new RelayError("UPSTREAM_ERROR", "上游跳转次数过多");
    }

    await discardBody(response);

    currentUrl = resolveLocation(currentUrl, location);
    if (options.upgradeSsoHttp) currentUrl = upgradeSsoUrl(currentUrl);
    visited.push(currentUrl);

    // 登录票据链后续跳转一律 GET，与浏览器/参考实现一致。
    method = "GET";
    body = undefined;
  }
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // 丢弃响应体失败不影响后续跳转。
  }
}

function resolveLocation(base: string, location: string): string {
  try {
    return new URL(location, base).toString();
  } catch {
    throw new RelayError("UPSTREAM_ERROR", "上游跳转地址不合法");
  }
}

/** 仅升级 sso.buaa.edu.cn 的默认 HTTP 端口，其他地址不擅自改写。 */
function upgradeSsoUrl(url: string): string {
  const match = url.match(SSO_UPGRADE_PATTERN);
  if (!match) return url;
  return `https://sso.buaa.edu.cn${url.slice(match[0].length)}`;
}

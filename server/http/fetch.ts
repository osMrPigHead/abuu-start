/**
 * 带超时的 fetch：统一 abort 与网络错误到 RelayError，供上游 JSON 客户端
 * 与认证跳转客户端共用，见 docs/trd.md 3.3。
 */
import { RelayError } from "../core/errors.ts";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new RelayError("UPSTREAM_TIMEOUT", "上游请求超时");
    }
    throw new RelayError("UPSTREAM_ERROR", "上游请求失败");
  } finally {
    clearTimeout(timer);
  }
}

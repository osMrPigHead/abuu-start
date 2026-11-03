import { request } from "./client";
import type { RelayHealthResponse } from "@shared/api";

/** 设置页用于判断本地中继是否启动。 */
export function fetchRelayHealth(
  signal?: AbortSignal,
): Promise<RelayHealthResponse> {
  return request<RelayHealthResponse>("/api/health", { signal });
}

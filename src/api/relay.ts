import { request } from './client'

export type RelayHealthResponse = {
  ok: boolean
}

/** 设置页用于判断本地中继是否启动。 */
export function fetchRelayHealth(signal?: AbortSignal): Promise<RelayHealthResponse> {
  return request<RelayHealthResponse>('/api/health', { signal })
}

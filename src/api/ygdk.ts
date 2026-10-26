import { request } from './client'
import type { YgdkOverview } from '@/types'
import { readCredentials } from '@/utils/storage'

function ygdkHeaders(): HeadersInit {
  const { ygdkUid, ygdkToken } = readCredentials()

  return {
    'X-Ygdk-Uid': ygdkUid,
    'X-Ygdk-Token': ygdkToken,
  }
}

/** 阳光打卡概览；保存凭据后的校验也复用此接口，见 docs/api.md 5。 */
export function fetchYgdkOverview(signal?: AbortSignal): Promise<YgdkOverview> {
  return request<YgdkOverview>('/api/ygdk/overview', {
    headers: ygdkHeaders(),
    signal,
  })
}

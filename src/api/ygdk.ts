/** 阳光打卡概览；uid/token 由中继按当前登录会话注入，见 docs/api.md 5。 */
import { request } from './client'
import type { YgdkOverview } from '@/types'

export function fetchYgdkOverview(signal?: AbortSignal): Promise<YgdkOverview> {
  return request<YgdkOverview>('/api/ygdk/overview', { signal })
}

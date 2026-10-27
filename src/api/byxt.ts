/** 本研教育管理系统；凭据由中继按当前登录会话注入，见 docs/api.md 1。 */
import { request } from './client'
import type {
  ByxtStatusResponse,
  ExamsResponse,
  ScheduleResponse,
} from '@/types'

export function fetchByxtStatus(signal?: AbortSignal): Promise<ByxtStatusResponse> {
  return request<ByxtStatusResponse>('/api/byxt/status', { signal })
}

export function fetchByxtSchedule(
  week?: number,
  signal?: AbortSignal,
): Promise<ScheduleResponse> {
  const search = week === undefined ? '' : `?week=${encodeURIComponent(String(week))}`

  return request<ScheduleResponse>(`/api/byxt/schedule${search}`, { signal })
}

export function fetchByxtExams(signal?: AbortSignal): Promise<ExamsResponse> {
  return request<ExamsResponse>('/api/byxt/exams', { signal })
}

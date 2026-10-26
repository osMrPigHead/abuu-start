import { request } from './client'
import type {
  ByxtStatusResponse,
  ExamsResponse,
  ScheduleResponse,
} from '@/types'
import { readCredentials } from '@/utils/storage'

function byxtHeaders(): HeadersInit {
  return {
    'X-Byxt-Cookie': readCredentials().byxtCookie,
  }
}

export function fetchByxtStatus(signal?: AbortSignal): Promise<ByxtStatusResponse> {
  return request<ByxtStatusResponse>('/api/byxt/status', {
    headers: byxtHeaders(),
    signal,
  })
}

export function fetchByxtSchedule(
  week?: number,
  signal?: AbortSignal,
): Promise<ScheduleResponse> {
  const search = week === undefined ? '' : `?week=${encodeURIComponent(String(week))}`

  return request<ScheduleResponse>(`/api/byxt/schedule${search}`, {
    headers: byxtHeaders(),
    signal,
  })
}

export function fetchByxtExams(signal?: AbortSignal): Promise<ExamsResponse> {
  return request<ExamsResponse>('/api/byxt/exams', {
    headers: byxtHeaders(),
    signal,
  })
}

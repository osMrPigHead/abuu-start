/** SPOC 只读接口；Token/RoleCode 由中继按当前登录会话注入，见 docs/api.md 3。 */
import { request } from './client'
import type {
  SpocAssignmentDetailResponse,
  SpocAssignmentsResponse,
  SpocStatusResponse,
} from '@/types'

export function fetchSpocStatus(signal?: AbortSignal): Promise<SpocStatusResponse> {
  return request<SpocStatusResponse>('/api/spoc/status', { signal })
}

export function fetchSpocAssignments(signal?: AbortSignal): Promise<SpocAssignmentsResponse> {
  return request<SpocAssignmentsResponse>('/api/spoc/assignments', { signal })
}

export function fetchSpocAssignmentDetail(
  assignmentId: string,
  signal?: AbortSignal,
): Promise<SpocAssignmentDetailResponse> {
  const encodedId = encodeURIComponent(assignmentId)

  return request<SpocAssignmentDetailResponse>(`/api/spoc/assignments/${encodedId}`, {
    signal,
  })
}

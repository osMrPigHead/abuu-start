import { request } from './client'
import type {
  SpocAssignmentDetailResponse,
  SpocAssignmentsResponse,
  SpocStatusResponse,
} from '@/types'
import { readCredentials } from '@/utils/storage'

function spocHeaders(): HeadersInit {
  const { spocToken, spocRoleCode } = readCredentials()

  return {
    'X-Spoc-Token': spocToken,
    'X-Spoc-Role': spocRoleCode,
  }
}

export function fetchSpocStatus(signal?: AbortSignal): Promise<SpocStatusResponse> {
  return request<SpocStatusResponse>('/api/spoc/status', {
    headers: spocHeaders(),
    signal,
  })
}

export function fetchSpocAssignments(signal?: AbortSignal): Promise<SpocAssignmentsResponse> {
  return request<SpocAssignmentsResponse>('/api/spoc/assignments', {
    headers: spocHeaders(),
    signal,
  })
}

export function fetchSpocAssignmentDetail(
  assignmentId: string,
  signal?: AbortSignal,
): Promise<SpocAssignmentDetailResponse> {
  const encodedId = encodeURIComponent(assignmentId)

  return request<SpocAssignmentDetailResponse>(`/api/spoc/assignments/${encodedId}`, {
    headers: spocHeaders(),
    signal,
  })
}

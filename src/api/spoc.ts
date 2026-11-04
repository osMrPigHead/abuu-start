/** SPOC 只读接口；Token/RoleCode 由中继按当前登录会话注入，见 docs/api.md 3。 */
import { request } from "./client";
import type {
  SpocAssignmentDetailResponse,
  SpocAssignmentsResponse,
} from "@shared/api";

export function fetchSpocAssignments(): Promise<SpocAssignmentsResponse> {
  return request<SpocAssignmentsResponse>("/api/spoc/assignments");
}

export function fetchSpocAssignmentDetail(
  assignmentId: string,
): Promise<SpocAssignmentDetailResponse> {
  const encodedId = encodeURIComponent(assignmentId);

  return request<SpocAssignmentDetailResponse>(
    `/api/spoc/assignments/${encodedId}`,
  );
}

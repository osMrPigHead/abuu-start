/** 本研教育管理系统；凭据由中继按当前登录会话注入，见 docs/api.md 1。 */
import { request } from "./client";
import type { ExamsResponse, ScheduleResponse } from "@shared/api";

export function fetchByxtSchedule(week?: number): Promise<ScheduleResponse> {
  const search =
    week === undefined ? "" : `?week=${encodeURIComponent(String(week))}`;

  return request<ScheduleResponse>(`/api/byxt/schedule${search}`);
}

export function fetchByxtExams(): Promise<ExamsResponse> {
  return request<ExamsResponse>("/api/byxt/exams");
}

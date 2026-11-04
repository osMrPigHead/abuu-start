/** 博雅课程广场；auth_token 由中继按当前登录会话注入，见 docs/api.md 4。 */
import { BYKC_DEFAULT_PAGE_SIZE } from "@shared/validation";
import { request } from "./client";
import type {
  BykcChosenResponse,
  BykcCoursePage,
  BykcCourseResponse,
} from "@shared/api";

/** 课程广场默认每页数量，见 docs/prd-phase2.md 4.2.3。 */
export const BYKC_PAGE_SIZE = BYKC_DEFAULT_PAGE_SIZE;

/** 读取当前学期已选博雅课程：中继先 getAllConfig 再 queryChosenCourse。 */
export function fetchBykcChosen(): Promise<BykcChosenResponse> {
  return request<BykcChosenResponse>("/api/bykc/chosen");
}

export function fetchBykcCourses(
  page: number,
  pageSize: number = BYKC_PAGE_SIZE,
): Promise<BykcCoursePage> {
  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  return request<BykcCoursePage>(`/api/bykc/courses?${search.toString()}`);
}

export function fetchBykcCourse(courseId: number): Promise<BykcCourseResponse> {
  return request<BykcCourseResponse>(
    `/api/bykc/courses/${encodeURIComponent(String(courseId))}`,
  );
}

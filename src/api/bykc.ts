/** 博雅课程广场；auth_token 由中继按当前登录会话注入，见 docs/api.md 4。 */
import { request } from './client'
import type {
  BykcChosenResponse,
  BykcCoursePage,
  BykcCourseResponse,
  BykcStatusResponse,
} from '@/types'

/** 课程广场默认每页数量，见 docs/prd-phase2.md 4.2.3。 */
export const BYKC_PAGE_SIZE = 12

/** 校验登录状态：中继调用 getUserProfile，见 docs/api.md 4.2。 */
export function fetchBykcStatus(signal?: AbortSignal): Promise<BykcStatusResponse> {
  return request<BykcStatusResponse>('/api/bykc/status', { signal })
}

/** 读取当前学期已选博雅课程：中继先 getAllConfig 再 queryChosenCourse。 */
export function fetchBykcChosen(signal?: AbortSignal): Promise<BykcChosenResponse> {
  return request<BykcChosenResponse>('/api/bykc/chosen', { signal })
}

export function fetchBykcCourses(
  page: number,
  pageSize: number = BYKC_PAGE_SIZE,
  signal?: AbortSignal,
): Promise<BykcCoursePage> {
  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })

  return request<BykcCoursePage>(`/api/bykc/courses?${search.toString()}`, { signal })
}

export function fetchBykcCourse(
  courseId: number,
  signal?: AbortSignal,
): Promise<BykcCourseResponse> {
  return request<BykcCourseResponse>(
    `/api/bykc/courses/${encodeURIComponent(String(courseId))}`,
    { signal },
  )
}

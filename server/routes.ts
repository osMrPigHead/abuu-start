import type { IncomingHttpHeaders } from 'node:http'
import { bykcChosen, bykcCourseDetail, bykcCourses, bykcStatus } from './bykc.ts'
import { byxtExams, byxtSchedule, byxtStatus } from './byxt.ts'
import { spocAssignmentDetail, spocAssignments, spocStatus } from './spoc.ts'
import { ygdkOverview } from './ygdk.ts'

export type RouteContext = {
  url: URL
  headers: IncomingHttpHeaders
}

export type RouteHandler = (context: RouteContext) => Promise<unknown> | unknown

/**
 * 只读白名单路由表。
 * 未列出的 /api/* 一律 404，不回退到 SPA。
 */
export const routes: Record<string, RouteHandler> = {
  '/api/health': () => ({ ok: true }),
  '/api/byxt/status': ({ headers }) => byxtStatus(headers),
  '/api/byxt/schedule': ({ url, headers }) => byxtSchedule(headers, url),
  '/api/byxt/exams': ({ headers }) => byxtExams(headers),
  '/api/spoc/status': ({ headers }) => spocStatus(headers),
  '/api/spoc/assignments': ({ headers }) => spocAssignments(headers),
  '/api/bykc/status': ({ headers }) => bykcStatus(headers),
  '/api/bykc/chosen': ({ headers }) => bykcChosen(headers),
  '/api/bykc/courses': ({ url, headers }) => bykcCourses(headers, url),
  '/api/ygdk/overview': ({ headers }) => ygdkOverview(headers),
}

const SPOC_DETAIL_PREFIX = '/api/spoc/assignments/'
const BYKC_DETAIL_PREFIX = '/api/bykc/courses/'

/**
 * 精确匹配优先；详情路由按前缀匹配，id 交给 handler 做格式校验。
 */
export function resolveRoute(pathname: string): RouteHandler | null {
  const exact = routes[pathname]
  if (exact) return exact

  if (pathname.startsWith(SPOC_DETAIL_PREFIX)) {
    const assignmentId = pathname.slice(SPOC_DETAIL_PREFIX.length)
    if (assignmentId.length === 0 || assignmentId.includes('/')) return null

    return ({ headers }) => spocAssignmentDetail(headers, assignmentId)
  }

  if (pathname.startsWith(BYKC_DETAIL_PREFIX)) {
    const courseId = pathname.slice(BYKC_DETAIL_PREFIX.length)
    if (courseId.length === 0 || courseId.includes('/')) return null

    return ({ headers }) => bykcCourseDetail(headers, courseId)
  }

  return null
}
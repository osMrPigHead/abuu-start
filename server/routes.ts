import type { IncomingHttpHeaders } from 'node:http'
import {
  getBackgroundManifest,
  rescanBackground,
  setBackgroundDirectory,
} from './background.ts'
import { bykcChosen, bykcCourseDetail, bykcCourses, bykcStatus } from './bykc.ts'
import { byxtExams, byxtSchedule, byxtStatus } from './byxt.ts'
import { RelayError } from './errors.ts'
import { spocAssignmentDetail, spocAssignments, spocStatus } from './spoc.ts'
import { ygdkOverview } from './ygdk.ts'

export type RouteContext = {
  url: URL
  headers: IncomingHttpHeaders
  /** 仅 POST 接口提供；无请求体时为 undefined。 */
  body?: unknown
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
  '/api/background': () => getBackgroundManifest(),
}

/** 仅白名单 POST；其他路径的 POST 由路由未命中返回 404。 */
export const postRoutes: Record<string, RouteHandler> = {
  '/api/background/directory': ({ body }) => setBackgroundDirectory(readDirectoryPath(body)),
  '/api/background/rescan': () => rescanBackground(),
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

/** POST 只做精确匹配，不提供前缀路由。 */
export function resolvePostRoute(pathname: string): RouteHandler | null {
  return postRoutes[pathname] ?? null
}

function readDirectoryPath(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RelayError('INVALID_REQUEST', '请求体必须是 JSON 对象')
  }
  if (!('path' in body)) {
    throw new RelayError('INVALID_REQUEST', '缺少 path')
  }
  return (body as { path?: unknown }).path
}
import {
  getAuthStatus,
  loginAuth,
  logoutAuth,
  preloadAuth,
  retryAuthSource,
  withSourceRetry,
} from './authSession.ts'
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
  /** 仅 POST 接口提供；无请求体时为 undefined。 */
  body?: unknown
}

export type RouteHandler = (context: RouteContext) => Promise<unknown> | unknown

/**
 * 只读白名单路由表。
 * 未列出的 /api/* 一律 404，不回退到 SPA。
 * 业务接口的凭据由 authSession 注入，路由不再读取任何 X-* 请求头。
 */
export const routes: Record<string, RouteHandler> = {
  '/api/health': () => ({ ok: true }),
  '/api/auth/status': ({ url }) => getAuthStatus(url.searchParams.get('validate') === '1'),
  '/api/byxt/status': () => withSourceRetry('byxt', byxtStatus),
  '/api/byxt/schedule': ({ url }) => withSourceRetry('byxt', () => byxtSchedule(url)),
  '/api/byxt/exams': () => withSourceRetry('byxt', byxtExams),
  '/api/spoc/status': () => withSourceRetry('spoc', spocStatus),
  '/api/spoc/assignments': () => withSourceRetry('spoc', spocAssignments),
  '/api/bykc/status': () => withSourceRetry('bykc', bykcStatus),
  '/api/bykc/chosen': () => withSourceRetry('bykc', bykcChosen),
  '/api/bykc/courses': ({ url }) => withSourceRetry('bykc', () => bykcCourses(url)),
  '/api/ygdk/overview': () => withSourceRetry('ygdk', ygdkOverview),
  '/api/background': () => getBackgroundManifest(),
}

/** 仅白名单 POST；其他路径的 POST 由路由未命中返回 404。 */
export const postRoutes: Record<string, RouteHandler> = {
  '/api/auth/preload': () => preloadAuth(),
  '/api/auth/login': ({ body }) => loginAuth(body),
  '/api/auth/logout': () => logoutAuth(),
  '/api/background/directory': ({ body }) => setBackgroundDirectory(readDirectoryPath(body)),
  '/api/background/rescan': () => rescanBackground(),
}

const SPOC_DETAIL_PREFIX = '/api/spoc/assignments/'
const BYKC_DETAIL_PREFIX = '/api/bykc/courses/'
const AUTH_SOURCE_RETRY_PREFIX = '/api/auth/sources/'
const SOURCE_RETRY_PATTERN = /^([a-z]+)\/retry$/

/**
 * 精确匹配优先；详情路由按前缀匹配，id 交给 handler 做格式校验。
 */
export function resolveRoute(pathname: string): RouteHandler | null {
  const exact = routes[pathname]
  if (exact) return exact

  if (pathname.startsWith(SPOC_DETAIL_PREFIX)) {
    const assignmentId = pathname.slice(SPOC_DETAIL_PREFIX.length)
    if (assignmentId.length === 0 || assignmentId.includes('/')) return null

    return () => withSourceRetry('spoc', () => spocAssignmentDetail(assignmentId))
  }

  if (pathname.startsWith(BYKC_DETAIL_PREFIX)) {
    const courseId = pathname.slice(BYKC_DETAIL_PREFIX.length)
    if (courseId.length === 0 || courseId.includes('/')) return null

    return () => withSourceRetry('bykc', () => bykcCourseDetail(courseId))
  }

  return null
}

/** POST：精确匹配优先，`/api/auth/sources/:source/retry` 按前缀匹配。 */
export function resolvePostRoute(pathname: string): RouteHandler | null {
  const exact = postRoutes[pathname]
  if (exact) return exact

  if (pathname.startsWith(AUTH_SOURCE_RETRY_PREFIX)) {
    const rest = pathname.slice(AUTH_SOURCE_RETRY_PREFIX.length)
    const match = SOURCE_RETRY_PATTERN.exec(rest)
    const source = match?.[1]
    if (!source) return null

    return () => retryAuthSource(source)
  }

  return null
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

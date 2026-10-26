import type { IncomingHttpHeaders } from 'node:http'
import { byxtExams, byxtSchedule, byxtStatus } from './byxt.ts'

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
}

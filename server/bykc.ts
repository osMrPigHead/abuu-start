/**
 * 博雅课程广场的中继实现，见 docs/api.md 3、docs/trd-phase2.md 3.2 / 3.3。
 *
 * 只读白名单：getUserProfile、queryStudentSemesterCourseByPage、queryCourseById。
 * 不调用选课、退课、签到等写接口；上游路径全部写死，不接受任意 URL。
 */
import { bykcToken as sessionBykcToken } from './authSession.ts'
import { decryptResponse, encryptRequest } from './bykcCrypto.ts'
import { RelayError } from './errors.ts'
import { fetchUpstream, isTransientStatus } from './http.ts'
import type {
  BykcChosenCourse,
  BykcChosenResponse,
  BykcChosenTerm,
  BykcCourse,
  BykcCourseDetail,
  BykcCoursePage,
  BykcCourseResponse,
  BykcCourseStatus,
  BykcStatusResponse,
} from './types.ts'

const BASE_URL = 'https://bykc.buaa.edu.cn/sscv/'
const REFERER = 'https://bykc.buaa.edu.cn/system/course-select'
const ORIGIN = 'https://bykc.buaa.edu.cn'

const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 50
const PAGE_NUMBER_RE = /^\d{1,4}$/
const COURSE_ID_RE = /^\d{1,16}$/

/** 上游认证失效文案关键字，见 docs/trd-phase2.md 3.3。 */
const AUTH_MESSAGE_RE = /登录|会话|未登录|认证/

type BykcEnvelope = {
  status: unknown
  data: unknown
  errmsg: unknown
}

/** 校验博雅 auth_token：调用 getUserProfile。 */
export async function bykcStatus(): Promise<BykcStatusResponse> {
  const token = requireBykcToken()
  const data = await callBykc(token, 'getUserProfile', {})

  if (!isRecord(data)) {
    throw new RelayError('UPSTREAM_ERROR', '博雅资料响应异常')
  }

  return {
    user: { name: readText(data.realName) ?? '' },
    term: { name: isRecord(data.term) ? (readText(data.term.termName) ?? '') : '' },
  }
}

/**
 * 已选博雅课程：先用 getAllConfig 解析当前学期起止日期，再调 queryChosenCourse。
 * 只读：不调用选课、退课、签到。
 */
export async function bykcChosen(): Promise<BykcChosenResponse> {
  const token = requireBykcToken()
  const config = await callBykc(token, 'getAllConfig', {})
  const term = resolveChosenTerm(config)

  const data = await callBykc(token, 'queryChosenCourse', {
    startDate: term.startDate,
    endDate: term.endDate,
  })

  const list = isRecord(data) && Array.isArray(data.courseList) ? data.courseList : []
  const courses: BykcChosenCourse[] = []
  const seen = new Set<string>()

  for (const item of list) {
    if (!isRecord(item) || !isRecord(item.courseInfo)) continue

    const course = normalizeChosenCourse(item.courseInfo)
    if (!course) continue

    const key = `${course.courseId}|${course.startTime ?? ''}`
    if (seen.has(key)) continue

    seen.add(key)
    courses.push(course)
  }

  return { term, courses }
}

/** 课程广场分页；不做状态过滤，状态由中继计算。 */
export async function bykcCourses(url: URL): Promise<BykcCoursePage> {
  const token = requireBykcToken()
  const { page, pageSize } = readPageQuery(url)
  const data = await callBykc(token, 'queryStudentSemesterCourseByPage', { pageNumber: page, pageSize })

  if (!isRecord(data)) {
    throw new RelayError('BAD_RESPONSE', '博雅课程列表响应异常')
  }

  const content = Array.isArray(data.content) ? data.content : []
  const courses = content
    .map(normalizeCourse)
    .filter((course): course is BykcCourse => course !== null)

  return {
    page,
    pageSize,
    total: readInteger(data.totalElements) ?? 0,
    totalPages: Math.max(0, readInteger(data.totalPages) ?? 0),
    courses,
  }
}

/** 课程详情；简介转为纯文本后返回。 */
export async function bykcCourseDetail(idValue: string): Promise<BykcCourseResponse> {
  const token = requireBykcToken()
  const id = parseCourseId(idValue)
  const data = await callBykc(token, 'queryCourseById', { id })

  if (!isRecord(data) || typeof data.courseName !== 'string' || data.courseName.trim().length === 0) {
    throw new RelayError('NOT_FOUND', '未找到该博雅课程')
  }

  const course = normalizeCourse(data)
  if (!course) {
    throw new RelayError('NOT_FOUND', '未找到该博雅课程')
  }

  const detail: BykcCourseDetail = {
    ...course,
    descriptionText: htmlToText(readText(data.courseDesc) ?? ''),
  }

  return { course: detail }
}

/* ------------------------------- 上游调用 ------------------------------- */

function requireBykcToken(): string {
  return sessionBykcToken()
}

/**
 * 加密调用一次博雅接口并返回 `data`。
 * 3xx / 非 200、解密后含登录失效文案、业务码非 0 且 errmsg 含认证关键字，均按认证失效处理。
 */
async function callBykc(token: string, apiName: string, payload: unknown): Promise<unknown> {
  const encrypted = encryptRequest(JSON.stringify(payload))

  const result = await fetchUpstream(`${BASE_URL}${apiName}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      Origin: ORIGIN,
      Referer: REFERER,
      auth_token: token,
      authtoken: token,
      ak: encrypted.ak,
      sk: encrypted.sk,
      ts: encrypted.ts,
    },
    body: encrypted.body,
  })

  if (isTransientStatus(result.status)) {
    throw new RelayError('UPSTREAM_ERROR', '博雅课程暂时不可用', result.status)
  }

  if (result.status < 200 || result.status >= 300) {
    throw new RelayError('AUTH_EXPIRED', '博雅登录状态已失效', result.status)
  }

  const decoded = decryptResponse(result.text, encrypted.aesKey)

  if (decoded.includes('会话已失效') || decoded.includes('未登录')) {
    throw new RelayError('AUTH_EXPIRED', '博雅登录状态已失效', result.status)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(decoded)
  } catch {
    throw new RelayError('BAD_RESPONSE', '博雅上游返回了无法解析的响应', result.status)
  }

  if (!isRecord(parsed)) {
    throw new RelayError('BAD_RESPONSE', '博雅上游返回了异常响应', result.status)
  }

  const envelope: BykcEnvelope = {
    status: parsed.status,
    data: parsed.data,
    errmsg: parsed.errmsg,
  }

  if (envelope.status !== '0') {
    const message = readText(envelope.errmsg) ?? ''

    if (AUTH_MESSAGE_RE.test(message)) {
      throw new RelayError('AUTH_EXPIRED', '博雅登录状态已失效', result.status)
    }

    throw new RelayError('UPSTREAM_ERROR', message || '博雅上游返回业务错误', result.status)
  }

  return envelope.data
}

/* ------------------------------- 查询参数 ------------------------------- */

function readPageQuery(url: URL): { page: number; pageSize: number } {
  const page = parsePageNumber(url.searchParams.get('page'), 1)
  const pageSize = parsePageNumber(url.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)

  if (page === null) {
    throw new RelayError('INVALID_PAGE', '页码必须是从 1 开始的整数')
  }

  if (pageSize === null || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new RelayError('INVALID_PAGE', `每页数量必须是 1–${MAX_PAGE_SIZE} 的整数`)
  }

  return { page, pageSize }
}

function parsePageNumber(value: string | null, fallback: number): number | null {
  if (value === null || value.trim().length === 0) return fallback
  if (!PAGE_NUMBER_RE.test(value.trim())) return null

  const parsed = Number(value.trim())
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
}

function parseCourseId(value: string): number {
  const trimmed = value.trim()
  if (!COURSE_ID_RE.test(trimmed)) {
    throw new RelayError('INVALID_REQUEST', '课程 id 必须是十进制整数')
  }

  const id = Number(trimmed)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new RelayError('INVALID_REQUEST', '课程 id 超出安全整数范围')
  }

  return id
}

/* ------------------------------- 归一化 ------------------------------- */

/** 当前学期起止日期：优先时间落在起止内的一项，否则取结束最晚的一项。 */
function resolveChosenTerm(config: unknown): BykcChosenTerm {
  const semesters =
    isRecord(config) && Array.isArray(config.semester)
      ? config.semester.filter(isRecord)
      : []

  const candidates: BykcChosenTerm[] = []
  for (const semester of semesters) {
    const startDate = normalizeDateTime(semester.semesterStartDate)
    const endDate = normalizeDateTime(semester.semesterEndDate)
    if (startDate === null || endDate === null) continue

    candidates.push({
      name: readText(semester.semesterName) ?? '',
      startDate,
      endDate,
    })
  }

  if (candidates.length === 0) {
    throw new RelayError('UPSTREAM_ERROR', '博雅学期配置缺少起止日期')
  }

  const nowMs = Date.now()
  const current = candidates.find((semester) => {
    const start = toEpochMs(semester.startDate)
    const end = toEpochMs(semester.endDate)
    return start !== null && end !== null && nowMs >= start && nowMs <= end
  })
  if (current) return current

  return candidates.reduce((latest, semester) =>
    (toEpochMs(semester.endDate) ?? 0) > (toEpochMs(latest.endDate) ?? 0) ? semester : latest,
  )
}

/** 已选课程记录里的 courseInfo；没有课程名或 id 时跳过。 */
function normalizeChosenCourse(courseInfo: Record<string, unknown>): BykcChosenCourse | null {
  const courseId = readInteger(courseInfo.id)
  const courseName = readText(courseInfo.courseName)
  if (courseId === null || courseId <= 0 || !courseName) return null

  return {
    courseId,
    courseName,
    startTime: normalizeDateTime(courseInfo.courseStartDate),
    endTime: normalizeDateTime(courseInfo.courseEndDate),
    place: readText(courseInfo.coursePosition),
    teacher: readText(courseInfo.courseTeacher),
  }
}

function normalizeCourse(value: unknown): BykcCourse | null {
  if (!isRecord(value)) return null

  const id = readInteger(value.id)
  const courseName = readText(value.courseName)
  if (id === null || id <= 0 || !courseName) return null

  return {
    id,
    courseName,
    startTime: normalizeDateTime(value.courseStartDate),
    endTime: normalizeDateTime(value.courseEndDate),
    place: readText(value.coursePosition),
    teacher: readText(value.courseTeacher),
    status: resolveCourseStatus(value),
    selected: value.selected === true,
    currentCount: readInteger(value.courseCurrentCount),
    maxCount: Math.max(0, readInteger(value.courseMaxCount) ?? 0),
  }
}

/** 状态判定顺序见 docs/api.md 3.3；时间按 Asia/Shanghai（+08:00）比较。 */
function resolveCourseStatus(course: Record<string, unknown>): BykcCourseStatus {
  const nowMs = Date.now()
  const startMs = toEpochMs(course.courseStartDate)
  const selectStartMs = toEpochMs(course.courseSelectStartDate)
  const selectEndMs = toEpochMs(course.courseSelectEndDate)
  const maxCount = Math.max(0, readInteger(course.courseMaxCount) ?? 0)
  const currentCount = readInteger(course.courseCurrentCount)

  if (startMs !== null && nowMs > startMs) return 'expired'
  if (course.selected === true) return 'selected'
  if (selectEndMs !== null && nowMs > selectEndMs) return 'ended'
  if (currentCount !== null && maxCount > 0 && currentCount >= maxCount) return 'full'
  if (selectStartMs !== null && nowMs < selectStartMs) return 'preview'
  return 'available'
}

/** 上游时间统一为 "YYYY-MM-DD HH:mm:ss"；空值或格式异常返回 null。 */
function normalizeDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/)
  if (!match) return null

  const date = match[1]
  const time = match[2] ?? ''
  return time.length === 5 ? `${date} ${time}:00` : `${date} ${time}`
}

/** 按 Asia/Shanghai 解析为毫秒；无效值返回 null。 */
function toEpochMs(value: unknown): number | null {
  const text = normalizeDateTime(value)
  if (!text) return null

  const parsed = Date.parse(`${text.replace(' ', 'T')}+08:00`)
  return Number.isNaN(parsed) ? null : parsed
}

/** HTML 片段转纯文本：保留段落换行，不返回任何标签。 */
function htmlToText(html: string): string {
  if (html.trim().length === 0) return ''

  const withBreaks = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')

  const text = decodeEntities(withBreaks.replace(/<[^>]*>/g, ' '))

  return text
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gi, '&')
}

/* ------------------------------- 基础辅助 ------------------------------- */


function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

function readInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isSafeInteger(parsed) ? parsed : null
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

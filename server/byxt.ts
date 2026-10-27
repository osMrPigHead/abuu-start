/**
 * byxt 上游调用与归一化，见 docs/trd.md 3.2、docs/api.md 1。
 *
 * 实现只读接口：currentUser、getTermWeeks、getMyScheduleDetail、exams。
 * 本模块不接受任意 URL，所有上游路径都写死在白名单函数里。
 */
import { byxtCookieHeader } from './authSession.ts'
import { RelayError } from './errors.ts'
import { fetchUpstream, isTransientStatus, looksLikeHtml } from './http.ts'
import type {
  ByxtEnvelope,
  ByxtStatus,
  Course,
  Exam,
  ExamsResponse,
  ScheduleResponse,
  SectionTime,
  Term,
  Week,
} from './types.ts'

const BASE_URL = 'https://byxt.buaa.edu.cn/jwapp/sys/homeapp/'
const REFERER_URL = 'https://byxt.buaa.edu.cn/jwapp/sys/homeapp/index.html'
const DEFAULT_WARNING = '无法确定当前教学周，已默认第 1 周'

/** docs/api.md 1.2 的固定作息表，仅在上游未返回 sectionTimes 时使用。 */
const FALLBACK_SECTION_TIMES: readonly SectionTime[] = [
  { section: 1, start: '08:00', end: '08:45' },
  { section: 2, start: '08:50', end: '09:35' },
  { section: 3, start: '09:50', end: '10:35' },
  { section: 4, start: '10:40', end: '11:25' },
  { section: 5, start: '11:30', end: '12:15' },
  { section: 6, start: '14:00', end: '14:45' },
  { section: 7, start: '14:50', end: '15:35' },
  { section: 8, start: '15:50', end: '16:35' },
  { section: 9, start: '16:40', end: '17:25' },
  { section: 10, start: '17:30', end: '18:15' },
  { section: 11, start: '19:00', end: '19:45' },
  { section: 12, start: '19:50', end: '20:35' },
  { section: 13, start: '20:40', end: '21:25' },
  { section: 14, start: '21:30', end: '22:15' },
]

type CurrentUser = {
  user: {
    id: string
    name: string
  }
  term: Term
  classWeek: number | null
}

type WeekSource = 'weeks' | 'classWeek' | 'default'

type WeekResolution = {
  currentWeek: number | null
  weekSource: WeekSource
}

type UpstreamRequest = {
  method?: 'GET' | 'POST'
  query?: URLSearchParams
  form?: URLSearchParams
}

/**
 * 调用 byxt JSON 接口并检查统一响应信封。
 * 按 docs/trd.md 3.3：非 2xx、非 JSON、HTML 登录页、解析失败都视为认证失效。
 */
async function requestByxt<T>(
  cookie: string,
  path: string,
  request: UpstreamRequest = {},
): Promise<T> {
  const url = new URL(path, BASE_URL)
  if (request.query) url.search = request.query.toString()

  const method = request.method ?? 'GET'
  const headers: Record<string, string> = {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: REFERER_URL,
    'fetch-api': 'true',
    Cookie: cookie,
  }

  let body: string | undefined
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    body = request.form?.toString() ?? ''
  }

  const result = await fetchUpstream(url.toString(), { method, headers, body })

  if (isTransientStatus(result.status)) {
    throw new RelayError('UPSTREAM_ERROR', '本研教育管理系统暂时不可用', result.status)
  }

  if (result.status < 200 || result.status >= 300) {
    throw new RelayError('AUTH_EXPIRED', '登录状态已失效', result.status)
  }

  const contentType = result.contentType?.toLowerCase() ?? ''
  if (
    !contentType.includes('json') ||
    looksLikeHtml(result.text) ||
    result.json === undefined
  ) {
    throw new RelayError('AUTH_EXPIRED', '登录状态已失效', result.status)
  }

  if (!isRecord(result.json)) {
    throw new RelayError('BAD_RESPONSE', '上游返回了无法识别的响应', result.status)
  }

  const envelope = result.json as unknown as ByxtEnvelope<T>
  if (String(envelope.code) !== '0') {
    const message = typeof envelope.msg === 'string' ? envelope.msg : ''
    if (/登录|认证|会话|token/i.test(message)) {
      throw new RelayError('AUTH_EXPIRED', message || '登录状态已失效', result.status)
    }
    throw new RelayError(
      'UPSTREAM_ERROR',
      message || '上游返回业务错误',
      result.status,
    )
  }

  return envelope.datas
}

async function fetchCurrentUser(cookie: string): Promise<CurrentUser> {
  const datas = await requestByxt<unknown>(cookie, 'api/home/currentUser.do')
  if (!isRecord(datas)) {
    throw new RelayError('BAD_RESPONSE', '当前用户响应格式异常')
  }

  const welcome = isRecord(datas.welcomeInfo) ? datas.welcomeInfo : {}
  return {
    user: {
      id: asString(datas.userId),
      name: asString(datas.userName),
    },
    term: {
      code: asString(welcome.xnxqdm),
      name: asString(welcome.xnxqmc),
    },
    classWeek: toPositiveInteger(welcome.classWeek),
  }
}

async function fetchTermWeeks(cookie: string, termCode: string): Promise<Week[]> {
  const query = new URLSearchParams({ termCode })
  const datas = await requestByxt<unknown>(cookie, 'api/home/getTermWeeks.do', { query })
  if (!Array.isArray(datas)) return []

  const weeks: Week[] = []
  datas.forEach((item, index) => {
    if (!isRecord(item)) return
    weeks.push({
      serialNumber: toPositiveInteger(item.serialNumber) ?? index + 1,
      name: asString(item.name) || `第${index + 1}周`,
      startDate: normalizeDateKey(item.startDate),
      endDate: normalizeDateKey(item.endDate),
      curWeek: isTruthy(item.curWeek),
    })
  })

  return weeks.sort((left, right) => left.serialNumber - right.serialNumber)
}

async function fetchWeekSchedule(
  cookie: string,
  termCode: string,
  week: number,
): Promise<{ sectionTimes: SectionTime[]; courses: Course[] }> {
  const form = new URLSearchParams({
    termCode,
    type: 'week',
    week: String(week),
  })
  const datas = await requestByxt<unknown>(cookie, 'api/home/student/getMyScheduleDetail.do', {
    method: 'POST',
    form,
  })

  const payload = isRecord(datas) ? datas : {}
  const sectionTimes = normalizeSectionTimes(payload.sectionTimes)
  const sectionMap = new Map(sectionTimes.map((item) => [item.section, item]))
  const rawCourses = Array.isArray(payload.arrangedList) ? payload.arrangedList : []

  const courses: Course[] = []
  for (const raw of rawCourses) {
    if (!isRecord(raw)) continue
    const beginSection = toPositiveInteger(raw.beginSection)
    const endSection = toPositiveInteger(raw.endSection)
    const beginTime =
      normalizeTime(raw.beginTime) ??
      (beginSection === null ? null : sectionMap.get(beginSection)?.start ?? null)
    const endTime =
      normalizeTime(raw.endTime) ??
      (endSection === null ? null : sectionMap.get(endSection)?.end ?? null)

    courses.push({
      courseCode: asString(raw.courseCode).trim(),
      courseName: asString(raw.courseName).trim() || '未知课程',
      beginSection,
      endSection,
      beginTime,
      endTime,
      placeName: nullableText(raw.placeName),
      weeksAndTeachers: nullableText(raw.weeksAndTeachers),
      dayOfWeek: normalizeDayOfWeek(raw.dayOfWeek),
    })
  }

  return { sectionTimes, courses: sortCourses(courses) }
}

function normalizeSectionTimes(value: unknown): SectionTime[] {
  const result: SectionTime[] = []

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue
      const section = toPositiveInteger(item.section)
      const start = normalizeTime(item.start)
      const end = normalizeTime(item.end)
      if (section === null || !start || !end) continue
      result.push({ section, start, end })
    }
  }

  if (result.length === 0) {
    return FALLBACK_SECTION_TIMES.map((item) => ({ ...item }))
  }

  return result.sort((left, right) => left.section - right.section)
}

function resolveCurrentWeek(
  weeks: readonly Week[],
  classWeek: number | null,
  now: Date,
): WeekResolution {
  const marked = weeks.find((week) => week.curWeek)
  if (marked) {
    return { currentWeek: marked.serialNumber, weekSource: 'weeks' }
  }

  const todayKey = formatLocalDateKey(now)
  const byDate = weeks.find(
    (week) =>
      week.startDate.length > 0 &&
      week.endDate.length > 0 &&
      todayKey >= week.startDate &&
      todayKey <= week.endDate,
  )
  if (byDate) {
    return { currentWeek: byDate.serialNumber, weekSource: 'weeks' }
  }

  if (classWeek !== null) {
    return { currentWeek: classWeek, weekSource: 'classWeek' }
  }

  return { currentWeek: null, weekSource: 'default' }
}

function parseRequestedWeek(raw: string | null, weeks: readonly Week[]): number | null {
  if (raw === null) return null
  if (!/^\d+$/.test(raw)) {
    throw new RelayError('INVALID_WEEK', '周次必须为正整数')
  }

  const week = Number(raw)
  if (!Number.isSafeInteger(week) || week < 1) {
    throw new RelayError('INVALID_WEEK', '周次必须为正整数')
  }
  if (weeks.length > 0 && week > weeks.length) {
    throw new RelayError('INVALID_WEEK', '周次超出当前学期范围')
  }

  return week
}

export async function byxtStatus(): Promise<ByxtStatus> {
  const cookie = byxtCookieHeader()
  const current = await fetchCurrentUser(cookie)

  return {
    user: current.user,
    term: current.term,
  }
}

export async function byxtSchedule(url: URL): Promise<ScheduleResponse> {
  const cookie = byxtCookieHeader()
  const current = await fetchCurrentUser(cookie)

  if (current.term.code.length === 0) {
    throw new RelayError('UPSTREAM_ERROR', '未获取到当前学期信息')
  }

  // 周次表只用于周次边界与当前周定位；失败不应阻塞本周课表。
  let weeks: Week[] = []
  try {
    weeks = await fetchTermWeeks(cookie, current.term.code)
  } catch (error) {
    if (error instanceof RelayError && error.code === 'AUTH_EXPIRED') throw error
  }

  const resolution = resolveCurrentWeek(weeks, current.classWeek, new Date())
  const requestedWeek = parseRequestedWeek(url.searchParams.get('week'), weeks)
  const week = requestedWeek ?? resolution.currentWeek ?? 1
  const schedule = await fetchWeekSchedule(cookie, current.term.code, week)

  return {
    term: current.term,
    weeks,
    currentWeek: resolution.currentWeek,
    weekSource: resolution.weekSource,
    week: {
      number: week,
      sectionTimes: schedule.sectionTimes,
      courses: schedule.courses,
    },
    warning: resolution.weekSource === 'default' ? DEFAULT_WARNING : null,
  }
}

export async function byxtExams(): Promise<ExamsResponse> {
  const cookie = byxtCookieHeader()
  const current = await fetchCurrentUser(cookie)

  if (current.term.code.length === 0) {
    throw new RelayError('UPSTREAM_ERROR', '未获取到当前学期信息')
  }

  const query = new URLSearchParams({ termCode: current.term.code })
  const datas = await requestByxt<unknown>(cookie, 'api/home/student/exams.do', { query })

  if (datas !== null && !Array.isArray(datas)) {
    throw new RelayError('BAD_RESPONSE', '考试响应格式异常')
  }

  const exams: Exam[] = []
  for (const raw of datas ?? []) {
    const exam = normalizeExam(raw)
    if (exam) exams.push(exam)
  }

  return { term: current.term, exams }
}

/* ------------------------------- 归一化辅助 ------------------------------- */

/**
 * 考试字段按 docs/api.md 1.2 原样保留时间字符串，由前端兼容多格式解析。
 * 缺 examDate 且缺 startTime 的未排定条目不在本期展示。
 */
function normalizeExam(value: unknown): Exam | null {
  if (!isRecord(value)) return null

  const examDate = nullableText(value.examDate)
  const startTime = nullableText(value.startTime)
  if (!examDate && !startTime) return null

  const exam: Exam = {
    courseName: asString(value.courseName).trim() || '未知考试',
  }

  const courseNo = nullableText(value.courseNo)
  if (courseNo) exam.courseNo = courseNo
  if (examDate) exam.examDate = examDate
  if (startTime) exam.startTime = startTime

  const endTime = nullableText(value.endTime)
  if (endTime) exam.endTime = endTime
  const examPlace = nullableText(value.examPlace)
  if (examPlace) exam.examPlace = examPlace
  const examSeatNo = nullableText(value.examSeatNo)
  if (examSeatNo) exam.examSeatNo = examSeatNo

  const week = toPositiveInteger(value.week)
  if (week !== null) exam.week = week
  const examTimeDescription = nullableText(value.examTimeDescription)
  if (examTimeDescription) exam.examTimeDescription = examTimeDescription

  return exam
}

function sortCourses(courses: readonly Course[]): Course[] {
  return [...courses].sort((left, right) => {
    const leftDay = left.dayOfWeek ?? Number.MAX_SAFE_INTEGER
    const rightDay = right.dayOfWeek ?? Number.MAX_SAFE_INTEGER
    if (leftDay !== rightDay) return leftDay - rightDay

    const leftSection = left.beginSection ?? Number.MAX_SAFE_INTEGER
    const rightSection = right.beginSection ?? Number.MAX_SAFE_INTEGER
    if (leftSection !== rightSection) return leftSection - rightSection

    return left.courseName.localeCompare(right.courseName, 'zh-Hans-CN')
  })
}

function normalizeDateKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? ''
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${match[2]}`
}

function normalizeDayOfWeek(value: unknown): number | null {
  const day = toPositiveInteger(value)
  if (day === null || day < 1 || day > 7) return null
  return day
}

function formatLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function toPositiveInteger(value: unknown): number | null {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN
  if (!Number.isSafeInteger(number) || number < 1) return null
  return number
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function nullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

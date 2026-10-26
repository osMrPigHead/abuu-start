/** 课表缓存优先加载、周切换与今日/明日派生，见 docs/trd.md 7.2。 */
import { reactive } from 'vue'
import { fetchByxtSchedule } from '@/api/byxt'
import { ApiError } from '@/api/client'
import { markByxtAuthExpired } from '@/composables/useCredentials'
import type {
  Course,
  ScheduleCache,
  SectionTime,
  SourceStatus,
  Term,
  Week,
  WeekCache,
  WeekSource,
} from '@/types'
import { readCredentials, readJson, remove, STORAGE_KEYS, writeJson } from '@/utils/storage'
import {
  DEFAULT_SECTION_TIMES,
  normalizeTime,
  resolveCurrentWeek,
  sortCourses,
} from '@/utils/schedule'

const DEFAULT_WARNING = '无法确定当前教学周，默认第 1 周'

export type WeekEntry = {
  status: SourceStatus
  courses: Course[]
  sectionTimes: SectionTime[]
  savedAt: string | null
  error: string | null
  loading: boolean
  loaded: boolean
}

type WeekMeta = {
  term: Term | null
  weeks: Week[]
  currentWeek: number | null
  weekSource: WeekSource
  warning: string | null
}

type BootState = {
  status: SourceStatus
  error: string | null
  loading: boolean
  hydrated: boolean
}

type MappedError = {
  status: SourceStatus
  message: string
}

const EMPTY_SECTION_TIMES: SectionTime[] = DEFAULT_SECTION_TIMES.map((item) => ({ ...item }))

const meta = reactive<WeekMeta>({
  term: null,
  weeks: [],
  currentWeek: null,
  weekSource: 'default',
  warning: null,
})

const entries = reactive<Record<number, WeekEntry>>({})
const boot = reactive<BootState>({
  status: 'idle',
  error: null,
  loading: false,
  hydrated: false,
})

const weekRequestIds = new Map<number, number>()
let currentRequestId = 0
let lastFetchedWeek: number | null = null

export function useSchedule() {
  hydrate()

  return {
    meta,
    entries,
    boot,
    hydrate,
    refreshCurrent,
    loadWeek,
    weekView,
    clearScheduleData,
  }
}

function hydrate(): void {
  if (boot.hydrated) return
  boot.hydrated = true

  const cache = readScheduleCache()
  if (!cache) return

  meta.term = cache.term
  meta.weeks = cache.weeks
  meta.currentWeek = cache.currentWeek
  meta.weekSource = cache.weekSource
  meta.warning = cache.weekSource === 'default' ? DEFAULT_WARNING : null
  lastFetchedWeek = cache.lastWeek

  // 课程缓存可能是跨学期旧数据；先用周次表日期重新定位当前周。
  if (cache.weeks.length > 0) {
    const resolved = resolveCurrentWeek(cache.weeks, null, new Date())
    if (resolved !== null) {
      meta.currentWeek = resolved
      meta.weekSource = 'weeks'
      meta.warning = null
    }
  }

  const cookiePresent = hasByxtCookie()
  for (const [key, cachedWeek] of Object.entries(cache.byWeek)) {
    const week = Number(key)
    if (!Number.isSafeInteger(week) || week < 1) continue

    entries[week] = {
      status: cookiePresent ? 'cached' : 'no-credential',
      courses: cachedWeek.courses,
      sectionTimes:
        cachedWeek.sectionTimes.length > 0 ? cachedWeek.sectionTimes : EMPTY_SECTION_TIMES,
      savedAt: cachedWeek.savedAt || null,
      error: null,
      loading: false,
      loaded: true,
    }
  }
}

async function refreshCurrent(): Promise<void> {
  hydrate()

  if (!hasByxtCookie()) {
    boot.status = 'no-credential'
    boot.error = null
    boot.loading = false

    const week = meta.currentWeek
    if (week !== null) {
      const entry = entries[week]
      if (entry) {
        entry.status = 'no-credential'
        entry.error = null
        entry.loading = false
      }
    }
    return
  }

  const previousWeek = meta.currentWeek
  boot.status = 'loading'
  boot.error = null
  boot.loading = true
  if (previousWeek !== null) {
    const previous = entries[previousWeek]
    if (previous) {
      previous.loading = true
      previous.error = null
      if (!previous.loaded) {
        previous.status = 'loading'
      } else if (previous.status === 'no-credential' || previous.status === 'auth-expired') {
        previous.status = 'cached'
      }
    }
  }

  const requestId = ++currentRequestId
  try {
    const response = await fetchByxtSchedule()
    if (requestId !== currentRequestId) return

    const actualWeek = applyResponse(response)
    boot.status = 'ok'
    boot.error = null
    boot.loading = false

    if (previousWeek !== null && previousWeek !== actualWeek) {
      const previous = entries[previousWeek]
      if (previous) previous.loading = false
    }
  } catch (error) {
    if (requestId !== currentRequestId) return

    const mapped = mapScheduleError(error)
    if (mapped.status === 'auth-expired') markByxtAuthExpired()

    boot.status = mapped.status
    boot.error = mapped.status === 'error' ? mapped.message : null
    boot.loading = false

    const week = meta.currentWeek ?? previousWeek
    const entry = week === null ? null : entries[week]
    if (entry) {
      entry.loading = false
      entry.error = mapped.message
      if (entry.loaded) {
        entry.status = mapped.status === 'error' ? 'cached' : mapped.status
      } else {
        entry.status = mapped.status
      }
    }
  }
}

async function loadWeek(week: number, options: { force?: boolean } = {}): Promise<void> {
  hydrate()
  if (!Number.isSafeInteger(week) || week < 1) return

  const entry = ensureEntry(week)
  if (!hasByxtCookie()) {
    entry.status = 'no-credential'
    entry.error = null
    entry.loading = false
    return
  }

  if (!options.force && entry.loaded) return

  const requestId = (weekRequestIds.get(week) ?? 0) + 1
  weekRequestIds.set(week, requestId)

  const hadData = entry.loaded
  entry.loading = true
  entry.error = null
  if (!hadData) {
    entry.status = 'loading'
  } else if (entry.status === 'no-credential' || entry.status === 'auth-expired') {
    entry.status = 'cached'
  }

  try {
    const response = await fetchByxtSchedule(week)
    if (weekRequestIds.get(week) !== requestId) return
    applyResponse(response)
  } catch (error) {
    if (weekRequestIds.get(week) !== requestId) return

    const mapped = mapScheduleError(error)
    if (mapped.status === 'auth-expired') markByxtAuthExpired()

    entry.loading = false
    entry.error = mapped.message
    if (hadData) {
      entry.status = mapped.status === 'error' ? 'cached' : mapped.status
    } else {
      entry.status = mapped.status
      entry.loaded = false
      entry.courses = []
      entry.sectionTimes = EMPTY_SECTION_TIMES
      entry.savedAt = null
    }
  }
}

function applyResponse(response: Awaited<ReturnType<typeof fetchByxtSchedule>>): number {
  const week = response.week.number
  meta.term = response.term
  if (response.weeks.length > 0 || meta.weeks.length === 0) {
    meta.weeks = response.weeks
  }
  meta.currentWeek = response.currentWeek
  meta.weekSource = response.weekSource
  meta.warning = response.warning

  const sectionTimes =
    response.week.sectionTimes.length > 0
      ? response.week.sectionTimes
      : EMPTY_SECTION_TIMES
  const entry = ensureEntry(week)
  entry.status = 'ok'
  entry.courses = sortCourses(response.week.courses, sectionTimes)
  entry.sectionTimes = sectionTimes
  entry.savedAt = new Date().toISOString()
  entry.error = null
  entry.loading = false
  entry.loaded = true
  lastFetchedWeek = week
  persistCache()
  return week
}

function ensureEntry(week: number): WeekEntry {
  const existing = entries[week]
  if (existing) return existing

  const entry: WeekEntry = {
    status: 'idle',
    courses: [],
    sectionTimes: EMPTY_SECTION_TIMES,
    savedAt: null,
    error: null,
    loading: false,
    loaded: false,
  }
  entries[week] = entry
  return entry
}

/** 当前周请求没有对应缓存条目时，用 boot 状态合成只读视图。 */
function weekView(week: number | null): WeekEntry {
  if (week !== null && entries[week]) return entries[week]

  const isCurrent = week === null || meta.currentWeek === null || week === meta.currentWeek
  if (!isCurrent) {
    return {
      status: 'loading',
      courses: [],
      sectionTimes: EMPTY_SECTION_TIMES,
      savedAt: null,
      error: null,
      loading: true,
      loaded: false,
    }
  }

  const status = boot.status === 'idle' ? 'loading' : boot.status
  return {
    status,
    courses: [],
    sectionTimes: EMPTY_SECTION_TIMES,
    savedAt: null,
    error: boot.error,
    loading: boot.loading || status === 'loading',
    loaded: false,
  }
}

function clearScheduleData(): void {
  remove(STORAGE_KEYS.scheduleCache)

  meta.term = null
  meta.weeks = []
  meta.currentWeek = null
  meta.weekSource = 'default'
  meta.warning = null

  for (const key of Object.keys(entries)) {
    Reflect.deleteProperty(entries, key)
  }

  boot.status = 'idle'
  boot.error = null
  boot.loading = false
  boot.hydrated = true
  currentRequestId += 1
  weekRequestIds.clear()
  lastFetchedWeek = null
}

/* ------------------------------- 缓存读写 ------------------------------- */

function readScheduleCache(): ScheduleCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.scheduleCache)
  if (!isRecord(raw)) return null

  const term = normalizeTerm(raw.term)
  const weeks = Array.isArray(raw.weeks)
    ? raw.weeks.map(normalizeWeek).filter((week): week is Week => week !== null)
    : []
  const currentWeek = toPositiveInteger(raw.currentWeek)
  const weekSource = normalizeWeekSource(raw.weekSource)
  const lastWeek = toPositiveInteger(raw.lastWeek)
  const byWeek: Record<number, WeekCache> = {}
  const rawByWeek = isRecord(raw.byWeek) ? raw.byWeek : {}

  for (const [key, value] of Object.entries(rawByWeek)) {
    const week = Number(key)
    if (!Number.isSafeInteger(week) || week < 1 || !isRecord(value)) continue

    byWeek[week] = {
      savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
      sectionTimes: normalizeSectionTimes(value.sectionTimes),
      courses: normalizeCourses(value.courses),
    }
  }

  return {
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    term,
    weeks,
    currentWeek,
    weekSource,
    lastWeek,
    byWeek,
  }
}

function persistCache(): void {
  const byWeek: Record<number, WeekCache> = {}
  for (const [key, entry] of Object.entries(entries)) {
    const week = Number(key)
    if (!Number.isSafeInteger(week) || week < 1 || !entry.loaded) continue

    byWeek[week] = {
      savedAt: entry.savedAt ?? new Date().toISOString(),
      sectionTimes: entry.sectionTimes,
      courses: entry.courses,
    }
  }

  if (!meta.term) return

  const cache: ScheduleCache = {
    savedAt: new Date().toISOString(),
    term: meta.term,
    weeks: meta.weeks,
    currentWeek: meta.currentWeek,
    weekSource: meta.weekSource,
    lastWeek: lastFetchedWeek,
    byWeek,
  }
  writeJson(STORAGE_KEYS.scheduleCache, cache)
}

/* ------------------------------- 归一化 ------------------------------- */

function normalizeTerm(value: unknown): Term {
  if (!isRecord(value)) return { code: '', name: '' }
  return {
    code: asString(value.code),
    name: asString(value.name),
  }
}

function normalizeWeek(value: unknown): Week | null {
  if (!isRecord(value)) return null

  const serialNumber = toPositiveInteger(value.serialNumber)
  if (serialNumber === null) return null

  return {
    serialNumber,
    name: asString(value.name) || `第${serialNumber}周`,
    startDate: normalizeDateKey(value.startDate),
    endDate: normalizeDateKey(value.endDate),
    curWeek: value.curWeek === true,
  }
}

function normalizeSectionTimes(value: unknown): SectionTime[] {
  if (!Array.isArray(value)) return EMPTY_SECTION_TIMES

  const result: SectionTime[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const section = toPositiveInteger(item.section)
    const start = normalizeTime(asString(item.start))
    const end = normalizeTime(asString(item.end))
    if (section === null || !start || !end) continue
    result.push({ section, start, end })
  }

  return result.length > 0
    ? result.sort((left, right) => left.section - right.section)
    : EMPTY_SECTION_TIMES
}

function normalizeCourses(value: unknown): Course[] {
  if (!Array.isArray(value)) return []

  const courses: Course[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const courseName = asString(item.courseName).trim()
    if (courseName.length === 0) continue

    courses.push({
      courseCode: asString(item.courseCode),
      courseName,
      beginSection: toPositiveInteger(item.beginSection),
      endSection: toPositiveInteger(item.endSection),
      beginTime: normalizeTime(asString(item.beginTime)),
      endTime: normalizeTime(asString(item.endTime)),
      placeName: nullableText(item.placeName),
      weeksAndTeachers: nullableText(item.weeksAndTeachers),
      dayOfWeek: normalizeDayOfWeek(item.dayOfWeek),
    })
  }

  return courses
}

function normalizeDateKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
}

function normalizeDayOfWeek(value: unknown): number | null {
  const day = toPositiveInteger(value)
  if (day === null || day > 7) return null
  return day
}

function normalizeWeekSource(value: unknown): WeekSource {
  return value === 'weeks' || value === 'classWeek' || value === 'default'
    ? value
    : 'default'
}

/* ------------------------------- 错误映射 ------------------------------- */

function mapScheduleError(error: unknown): MappedError {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NO_CREDENTIAL':
        return { status: 'no-credential', message: '未配置本研教育管理系统 Cookie' }
      case 'AUTH_EXPIRED':
        return { status: 'auth-expired', message: '登录状态已失效，请到设置页更新 Cookie' }
      case 'INVALID_WEEK':
        return { status: 'error', message: '周次无效或超出当前学期范围' }
      case 'RELAY_UNREACHABLE':
        return { status: 'error', message: error.message }
      default:
        return { status: 'error', message: error.message || '课表加载失败' }
    }
  }

  return { status: 'error', message: '课表加载失败，请稍后重试' }
}

/* ------------------------------- 基础辅助 ------------------------------- */

function hasByxtCookie(): boolean {
  return readCredentials().byxtCookie.trim().length > 0
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

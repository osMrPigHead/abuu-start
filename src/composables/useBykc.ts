/** 博雅课程广场与课程详情：缓存优先、独立数据源状态，见 docs/trd-phase2.md 7.3 / 7.6。 */
import { reactive } from 'vue'
import { ApiError } from '@/api/client'
import {
  BYKC_PAGE_SIZE,
  fetchBykcChosen,
  fetchBykcCourse,
  fetchBykcCourses,
} from '@/api/bykc'
import { markBykcAuthExpired } from '@/composables/useCredentials'
import type {
  BykcChosenCache,
  BykcChosenCourse,
  BykcChosenTerm,
  BykcCourse,
  BykcCourseCache,
  BykcCourseDetail,
  BykcCourseStatus,
  BykcCoursesCache,
  SourceStatus,
} from '@/types'
import {
  bykcCourseCacheKey,
  bykcCoursesCacheKey,
  clearBykcCaches,
  readCredentials,
  readJson,
  STORAGE_KEYS,
  writeJson,
} from '@/utils/storage'

type BykcPageState = {
  page: number
  pageSize: number
  status: SourceStatus
  total: number
  totalPages: number
  courses: BykcCourse[]
  savedAt: string | null
  error: string | null
  loading: boolean
  hydrated: boolean
}

type BykcChosenState = {
  status: SourceStatus
  term: BykcChosenTerm | null
  courses: BykcChosenCourse[]
  savedAt: string | null
  error: string | null
  loading: boolean
  hydrated: boolean
}

type BykcDetailState = {
  courseId: number | null
  status: SourceStatus
  /** 打开 modal 时已有的列表字段，详情失败时仍可展示。 */
  preview: BykcCourse | null
  course: BykcCourseDetail | null
  savedAt: string | null
  error: string | null
  loading: boolean
  notFound: boolean
}

type MappedError = {
  status: SourceStatus
  message: string
  notFound?: boolean
}

const BYKC_STATUSES: readonly BykcCourseStatus[] = [
  'expired',
  'selected',
  'preview',
  'ended',
  'full',
  'available',
]

const state = reactive<BykcPageState>({
  page: 1,
  pageSize: BYKC_PAGE_SIZE,
  status: 'idle',
  total: 0,
  totalPages: 0,
  courses: [],
  savedAt: null,
  error: null,
  loading: false,
  hydrated: false,
})

const detailState = reactive<BykcDetailState>({
  courseId: null,
  status: 'idle',
  preview: null,
  course: null,
  savedAt: null,
  error: null,
  loading: false,
  notFound: false,
})

const chosenState = reactive<BykcChosenState>({
  status: 'idle',
  term: null,
  courses: [],
  savedAt: null,
  error: null,
  loading: false,
  hydrated: false,
})

let requestId = 0
let detailRequestId = 0
let chosenRequestId = 0

export function useBykc() {
  return {
    state,
    loadPage,
    refresh,
    clearBykcData,
  }
}

export function useBykcChosen() {
  return {
    state: chosenState,
    hydrate: hydrateChosen,
    refresh: refreshChosen,
  }
}

export function useBykcDetail() {
  return {
    state: detailState,
    open: openDetail,
    refresh: refreshDetail,
    close: closeDetail,
  }
}

/**
 * 打开某一页：先读该页缓存渲染，再后台请求最新数据。
 * 页码与每页数量变化时清空旧页数据，避免翻页时显示上一页内容。
 */
async function loadPage(page: number, pageSize: number = BYKC_PAGE_SIZE): Promise<void> {
  const targetPage = Number.isSafeInteger(page) && page >= 1 ? page : 1

  if (state.page !== targetPage || state.pageSize !== pageSize || !state.hydrated) {
    state.page = targetPage
    state.pageSize = pageSize
    state.hydrated = true
    state.status = 'idle'
    state.courses = []
    state.total = 0
    state.totalPages = 0
    state.savedAt = null
    state.error = null
    state.loading = false
    requestId += 1
    hydratePage()
  }

  await refresh()
}

async function refresh(): Promise<void> {
  if (!hasBykcCredentials()) {
    state.status = 'no-credential'
    state.error = null
    state.loading = false
    return
  }

  const hadData = state.savedAt !== null
  const currentRequest = ++requestId

  state.loading = true
  state.error = null
  if (!hadData) {
    state.status = 'loading'
  } else if (state.status === 'no-credential' || state.status === 'auth-expired') {
    state.status = 'cached'
  }

  try {
    const response = await fetchBykcCourses(state.page, state.pageSize)
    if (currentRequest !== requestId) return

    state.page = response.page
    state.pageSize = response.pageSize
    state.courses = response.courses
    state.total = response.total
    state.totalPages = response.totalPages
    state.savedAt = new Date().toISOString()
    state.status = 'ok'
    state.error = null
    state.loading = false
    persistPage()
  } catch (error) {
    if (currentRequest !== requestId) return

    const mapped = mapBykcError(error, '博雅课程广场加载失败')
    if (mapped.status === 'auth-expired') markBykcAuthExpired()

    state.loading = false
    state.error = mapped.message

    if (hadData) {
      state.status = mapped.status === 'error' ? 'cached' : mapped.status
    } else {
      state.status = mapped.status
      state.courses = []
      state.total = 0
      state.totalPages = 0
      state.savedAt = null
    }
  }
}

function openDetail(course: BykcCourse): void {
  detailRequestId += 1
  detailState.courseId = course.id
  detailState.preview = course
  detailState.course = null
  detailState.savedAt = null
  detailState.error = null
  detailState.loading = false
  detailState.notFound = false
  detailState.status = 'idle'

  const cache = readCourseCache(course.id)
  if (cache) {
    detailState.course = cache.course
    detailState.savedAt = cache.savedAt || null
    detailState.status = hasBykcCredentials() ? 'cached' : 'no-credential'
  }

  void refreshDetail()
}

async function refreshDetail(): Promise<void> {
  const courseId = detailState.courseId
  if (courseId === null) return

  if (!hasBykcCredentials()) {
    detailState.status = 'no-credential'
    detailState.error = null
    detailState.loading = false
    return
  }

  const hadData = detailState.savedAt !== null
  const currentRequest = ++detailRequestId

  detailState.loading = true
  detailState.error = null
  detailState.notFound = false
  if (!hadData) {
    detailState.status = 'loading'
  } else if (detailState.status === 'no-credential' || detailState.status === 'auth-expired') {
    detailState.status = 'cached'
  }

  try {
    const response = await fetchBykcCourse(courseId)
    if (currentRequest !== detailRequestId || detailState.courseId !== courseId) return

    detailState.course = response.course
    detailState.savedAt = new Date().toISOString()
    detailState.status = 'ok'
    detailState.loading = false
    writeJson(bykcCourseCacheKey(courseId), {
      savedAt: detailState.savedAt,
      course: response.course,
    } satisfies BykcCourseCache)
  } catch (error) {
    if (currentRequest !== detailRequestId || detailState.courseId !== courseId) return

    const mapped = mapBykcError(error, '博雅课程详情加载失败')
    if (mapped.status === 'auth-expired') markBykcAuthExpired()

    detailState.loading = false
    detailState.error = mapped.message

    if (mapped.notFound) {
      detailState.notFound = true
      detailState.status = 'error'
      return
    }

    if (hadData) {
      detailState.status = mapped.status === 'error' ? 'cached' : mapped.status
    } else {
      detailState.status = mapped.status
      detailState.course = null
      detailState.savedAt = null
    }
  }
}

function closeDetail(): void {
  detailRequestId += 1
  detailState.courseId = null
  detailState.preview = null
  detailState.course = null
  detailState.savedAt = null
  detailState.error = null
  detailState.loading = false
  detailState.notFound = false
  detailState.status = 'idle'
}

/* ------------------------------- 已选课程 ------------------------------- */

/** 已选课程：先读缓存，再请求最新数据；失败保留缓存并标注时间。 */
function hydrateChosen(): void {
  if (chosenState.hydrated) return
  chosenState.hydrated = true

  const cache = readChosenCache()
  if (!cache) return

  chosenState.term = cache.term
  chosenState.courses = cache.courses
  chosenState.savedAt = cache.savedAt || null
  chosenState.status = hasBykcCredentials() ? 'cached' : 'no-credential'
}

async function refreshChosen(): Promise<void> {
  hydrateChosen()

  if (!hasBykcCredentials()) {
    chosenState.status = 'no-credential'
    chosenState.error = null
    chosenState.loading = false
    return
  }

  const hadData = chosenState.savedAt !== null
  const currentRequest = ++chosenRequestId

  chosenState.loading = true
  chosenState.error = null
  if (!hadData) {
    chosenState.status = 'loading'
  } else if (chosenState.status === 'no-credential' || chosenState.status === 'auth-expired') {
    chosenState.status = 'cached'
  }

  try {
    const response = await fetchBykcChosen()
    if (currentRequest !== chosenRequestId) return

    chosenState.term = response.term
    chosenState.courses = response.courses
    chosenState.savedAt = new Date().toISOString()
    chosenState.status = 'ok'
    chosenState.loading = false
    persistChosen()
  } catch (error) {
    if (currentRequest !== chosenRequestId) return

    const mapped = mapBykcError(error, '博雅已选课程加载失败')
    if (mapped.status === 'auth-expired') markBykcAuthExpired()

    chosenState.loading = false
    chosenState.error = mapped.message

    if (hadData) {
      chosenState.status = mapped.status === 'error' ? 'cached' : mapped.status
    } else {
      chosenState.status = mapped.status
      chosenState.term = null
      chosenState.courses = []
      chosenState.savedAt = null
    }
  }
}

function clearBykcData(): void {
  clearBykcCaches()

  requestId += 1
  state.page = 1
  state.pageSize = BYKC_PAGE_SIZE
  state.status = 'idle'
  state.total = 0
  state.totalPages = 0
  state.courses = []
  state.savedAt = null
  state.error = null
  state.loading = false
  state.hydrated = true

  chosenRequestId += 1
  chosenState.status = 'idle'
  chosenState.term = null
  chosenState.courses = []
  chosenState.savedAt = null
  chosenState.error = null
  chosenState.loading = false
  chosenState.hydrated = true

  closeDetail()
}

/* ------------------------------- 缓存读写 ------------------------------- */

function hydratePage(): void {
  const cache = readPageCache(state.page, state.pageSize)
  if (!cache) return

  state.courses = cache.courses
  state.total = cache.total
  state.totalPages = cache.totalPages
  state.savedAt = cache.savedAt || null
  state.status = hasBykcCredentials() ? 'cached' : 'no-credential'
}

function persistPage(): void {
  if (state.savedAt === null) return

  writeJson(bykcCoursesCacheKey(state.page, state.pageSize), {
    savedAt: state.savedAt,
    page: state.page,
    pageSize: state.pageSize,
    total: state.total,
    totalPages: state.totalPages,
    courses: state.courses,
  } satisfies BykcCoursesCache)
}

function readPageCache(page: number, pageSize: number): BykcCoursesCache | null {
  const raw = readJson<unknown>(bykcCoursesCacheKey(page, pageSize))
  if (!isRecord(raw)) return null

  const courses = Array.isArray(raw.courses)
    ? raw.courses.map(normalizeCourse).filter((course): course is BykcCourse => course !== null)
    : []
  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : ''
  if (savedAt.length === 0 && courses.length === 0) return null

  return {
    savedAt,
    page,
    pageSize,
    total: readInteger(raw.total) ?? courses.length,
    totalPages: Math.max(0, readInteger(raw.totalPages) ?? 0),
    courses,
  }
}

function readCourseCache(courseId: number): BykcCourseCache | null {
  const raw = readJson<unknown>(bykcCourseCacheKey(courseId))
  if (!isRecord(raw)) return null

  const course = normalizeCourseDetail(raw.course)
  if (!course || course.id !== courseId) return null

  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : ''
  return { savedAt, course }
}

function persistChosen(): void {
  if (chosenState.savedAt === null || chosenState.term === null) return

  writeJson(STORAGE_KEYS.bykcChosenCache, {
    savedAt: chosenState.savedAt,
    term: chosenState.term,
    courses: chosenState.courses,
  } satisfies BykcChosenCache)
}

function readChosenCache(): BykcChosenCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.bykcChosenCache)
  if (!isRecord(raw)) return null

  const term = normalizeChosenTerm(raw.term)
  const courses = Array.isArray(raw.courses)
    ? raw.courses.map(normalizeChosenCourse).filter((course): course is BykcChosenCourse => course !== null)
    : []
  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : ''
  if (savedAt.length === 0 && courses.length === 0) return null

  return { savedAt, term, courses }
}

/* ------------------------------- 归一化 ------------------------------- */

function normalizeChosenCourse(value: unknown): BykcChosenCourse | null {
  if (!isRecord(value)) return null

  const courseId = readInteger(value.courseId)
  const courseName = readText(value.courseName)
  if (courseId === null || courseId <= 0 || !courseName) return null

  return {
    courseId,
    courseName,
    startTime: readText(value.startTime),
    endTime: readText(value.endTime),
    place: readText(value.place),
    teacher: readText(value.teacher),
  }
}

function normalizeChosenTerm(value: unknown): BykcChosenTerm {
  if (!isRecord(value)) return { name: '', startDate: '', endDate: '' }

  return {
    name: readText(value.name) ?? '',
    startDate: readText(value.startDate) ?? '',
    endDate: readText(value.endDate) ?? '',
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
    startTime: readText(value.startTime),
    endTime: readText(value.endTime),
    place: readText(value.place),
    teacher: readText(value.teacher),
    status: normalizeStatus(value.status),
    selected: value.selected === true,
    currentCount: readInteger(value.currentCount),
    maxCount: Math.max(0, readInteger(value.maxCount) ?? 0),
  }
}

function normalizeCourseDetail(value: unknown): BykcCourseDetail | null {
  const base = normalizeCourse(value)
  if (!base || !isRecord(value)) return null

  return {
    ...base,
    descriptionText: readText(value.descriptionText),
  }
}

function normalizeStatus(value: unknown): BykcCourseStatus {
  return BYKC_STATUSES.includes(value as BykcCourseStatus)
    ? (value as BykcCourseStatus)
    : 'available'
}

/* ------------------------------- 错误映射 ------------------------------- */

function mapBykcError(error: unknown, fallback: string): MappedError {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NO_CREDENTIAL':
        return { status: 'no-credential', message: '未配置博雅课程 auth_token' }
      case 'AUTH_EXPIRED':
        return {
          status: 'auth-expired',
          message: '博雅登录状态已失效，请到设置页更新 auth_token',
        }
      case 'NOT_FOUND':
        return { status: 'error', message: '课程不存在或已下架', notFound: true }
      case 'INVALID_PAGE':
        return { status: 'error', message: '页码无效' }
      default:
        return { status: 'error', message: error.message || fallback }
    }
  }

  return { status: 'error', message: fallback }
}

/* ------------------------------- 基础辅助 ------------------------------- */

function hasBykcCredentials(): boolean {
  return readCredentials().bykcToken.trim().length > 0
}

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

/** 考试缓存优先加载与独立数据源状态，见 docs/trd.md 7.2 / 7.6。 */
import { reactive } from 'vue'
import { fetchByxtExams } from '@/api/byxt'
import { ApiError } from '@/api/client'
import { isAuthBlocked, markSourceExpired } from '@/composables/useAuth'
import type {
  Exam,
  ExamsCache,
  SourceStatus,
  Term,
} from '@/types'
import { readJson, remove, STORAGE_KEYS, writeJson } from '@/utils/storage'

type ExamsState = {
  status: SourceStatus
  term: Term | null
  exams: Exam[]
  savedAt: string | null
  error: string | null
  loading: boolean
  hydrated: boolean
}

type MappedError = {
  status: SourceStatus
  message: string
}

const state = reactive<ExamsState>({
  status: 'idle',
  term: null,
  exams: [],
  savedAt: null,
  error: null,
  loading: false,
  hydrated: false,
})

let requestId = 0

export function useExams() {
  hydrate()

  return {
    state,
    hydrate,
    refresh,
    clearExamsData,
  }
}

function hydrate(): void {
  if (state.hydrated) return
  state.hydrated = true

  const cache = readExamsCache()
  if (!cache) return

  state.term = cache.term
  state.exams = cache.exams
  state.savedAt = cache.savedAt || null
  state.status = isAuthBlocked() ? 'no-credential' : 'cached'
}

async function refresh(): Promise<void> {
  hydrate()

  if (isAuthBlocked()) {
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
    const response = await fetchByxtExams()
    if (currentRequest !== requestId) return

    state.term = response.term
    state.exams = response.exams
    state.savedAt = new Date().toISOString()
    state.status = 'ok'
    state.error = null
    state.loading = false
    persistCache()
  } catch (error) {
    if (currentRequest !== requestId) return

    const mapped = mapExamsError(error)
    if (mapped.status === 'auth-expired') markSourceExpired('byxt')

    state.loading = false
    state.error = mapped.message

    if (hadData) {
      state.status = mapped.status === 'error' ? 'cached' : mapped.status
    } else {
      state.status = mapped.status
      state.exams = []
      state.savedAt = null
      state.term = null
    }
  }
}

function clearExamsData(): void {
  remove(STORAGE_KEYS.examsCache)

  state.status = 'idle'
  state.term = null
  state.exams = []
  state.savedAt = null
  state.error = null
  state.loading = false
  state.hydrated = true
  requestId += 1
}

/* ------------------------------- 缓存读写 ------------------------------- */

function readExamsCache(): ExamsCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.examsCache)
  if (!isRecord(raw)) return null

  const exams = Array.isArray(raw.exams)
    ? raw.exams
        .map(normalizeExam)
        .filter((exam): exam is Exam => exam !== null)
    : []

  const term = normalizeTerm(raw.term)
  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : ''
  if (savedAt.length === 0 && exams.length === 0) return null

  return { savedAt, term, exams }
}

function persistCache(): void {
  if (!state.term || state.savedAt === null) return

  const cache: ExamsCache = {
    savedAt: state.savedAt,
    term: state.term,
    exams: state.exams,
  }
  writeJson(STORAGE_KEYS.examsCache, cache)
}

/* ------------------------------- 归一化 ------------------------------- */

function normalizeExam(value: unknown): Exam | null {
  if (!isRecord(value)) return null

  const courseName = asString(value.courseName).trim()
  if (courseName.length === 0) return null

  const examDate = nullableText(value.examDate)
  const startTime = nullableText(value.startTime)
  if (!examDate && !startTime) return null

  const exam: Exam = { courseName }
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

function normalizeTerm(value: unknown): Term {
  if (!isRecord(value)) return { code: '', name: '' }
  return {
    code: asString(value.code),
    name: asString(value.name),
  }
}

/* ------------------------------- 错误映射 ------------------------------- */

function mapExamsError(error: unknown): MappedError {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NO_CREDENTIAL':
      case 'AUTH_REQUIRED':
        return { status: 'no-credential', message: '未登录，请前往设置完成登录' }
      case 'AUTH_EXPIRED':
        return { status: 'auth-expired', message: '登录状态已失效，请到设置页重新登录' }
      case 'SOURCE_BUSY':
        return { status: 'error', message: '数据源正在派生，请稍后重试' }
      default:
        return { status: 'error', message: error.message || '考试加载失败' }
    }
  }

  return { status: 'error', message: '考试加载失败，请稍后重试' }
}

/* ------------------------------- 基础辅助 ------------------------------- */


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

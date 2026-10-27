/** SPOC 作业列表与详情：缓存优先、独立数据源状态，见 docs/trd.md 7.3 / 7.6。 */
import { reactive } from 'vue'
import { ApiError } from '@/api/client'
import { fetchSpocAssignmentDetail, fetchSpocAssignments } from '@/api/spoc'
import { isAuthBlocked, markSourceExpired } from '@/composables/useAuth'
import type {
  SourceStatus,
  SpocAssignment,
  SpocAssignmentDetail,
  SpocAssignmentsCache,
  SpocDetailCache,
  Term,
} from '@/types'
import { isValidSpocAssignmentId } from '@/utils/spoc'
import {
  clearSpocCaches,
  readJson,
  spocDetailCacheKey,
  STORAGE_KEYS,
  writeJson,
} from '@/utils/storage'

type SpocState = {
  status: SourceStatus
  term: Term | null
  assignments: SpocAssignment[]
  savedAt: string | null
  error: string | null
  loading: boolean
  hydrated: boolean
}

type SpocDetailState = {
  assignmentId: string | null
  /** 打开 modal 时列表已有的字段，详情失败时仍可展示。 */
  preview: SpocAssignment | null
  status: SourceStatus
  assignment: SpocAssignmentDetail | null
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

const state = reactive<SpocState>({
  status: 'idle',
  term: null,
  assignments: [],
  savedAt: null,
  error: null,
  loading: false,
  hydrated: false,
})

const detailState = reactive<SpocDetailState>({
  assignmentId: null,
  preview: null,
  status: 'idle',
  assignment: null,
  savedAt: null,
  error: null,
  loading: false,
  notFound: false,
})

let requestId = 0
let detailRequestId = 0

export function useSpoc() {
  hydrate()

  return {
    state,
    hydrate,
    refresh,
    clearSpocData,
  }
}

export function useSpocDetail() {
  return {
    state: detailState,
    open: openDetail,
    openById: openDetailById,
    refresh: refreshDetail,
    close: closeDetail,
  }
}

function hydrate(): void {
  if (state.hydrated) return
  state.hydrated = true

  const cache = readAssignmentsCache()
  if (!cache) return

  state.term = cache.term
  state.assignments = cache.assignments
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
    const response = await fetchSpocAssignments()
    if (currentRequest !== requestId) return

    state.term = response.term
    state.assignments = response.assignments
    state.savedAt = new Date().toISOString()
    state.status = 'ok'
    state.error = null
    state.loading = false
    persistAssignments()
  } catch (error) {
    if (currentRequest !== requestId) return

    const mapped = mapSpocError(error)
    if (mapped.status === 'auth-expired') markSourceExpired('spoc')

    state.loading = false
    state.error = mapped.message

    if (hadData) {
      state.status = mapped.status === 'error' ? 'cached' : mapped.status
    } else {
      state.status = mapped.status
      state.assignments = []
      state.savedAt = null
      state.term = null
    }
  }
}

function openDetail(assignment: SpocAssignment): void {
  openDetailById(assignment.assignmentId, assignment)
}

function openDetailById(assignmentId: string, preview: SpocAssignment | null = null): void {
  detailRequestId += 1

  detailState.assignmentId = assignmentId
  detailState.preview = preview
  detailState.status = 'idle'
  detailState.assignment = null
  detailState.savedAt = null
  detailState.error = null
  detailState.loading = false
  detailState.notFound = false

  if (!isValidSpocAssignmentId(assignmentId)) {
    detailState.notFound = true
    detailState.status = 'error'
    detailState.error = '未找到该作业'
    return
  }

  const cache = readDetailCache(assignmentId)
  if (cache) {
    detailState.assignment = cache.assignment
    detailState.savedAt = cache.savedAt || null
    detailState.status = isAuthBlocked() ? 'no-credential' : 'cached'
  }

  void refreshDetail()
}

async function refreshDetail(): Promise<void> {
  const assignmentId = detailState.assignmentId
  if (assignmentId === null || !isValidSpocAssignmentId(assignmentId)) return

  if (isAuthBlocked()) {
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
    const response = await fetchSpocAssignmentDetail(assignmentId)
    if (currentRequest !== detailRequestId || detailState.assignmentId !== assignmentId) return

    detailState.assignment = response.assignment
    detailState.savedAt = new Date().toISOString()
    detailState.status = 'ok'
    detailState.error = null
    detailState.loading = false
    persistDetail(assignmentId)
  } catch (error) {
    if (currentRequest !== detailRequestId || detailState.assignmentId !== assignmentId) return

    const mapped = mapSpocError(error)
    if (mapped.status === 'auth-expired') markSourceExpired('spoc')

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
      detailState.assignment = null
      detailState.savedAt = null
    }
  }
}

function closeDetail(): void {
  detailRequestId += 1
  detailState.assignmentId = null
  detailState.preview = null
  detailState.status = 'idle'
  detailState.assignment = null
  detailState.savedAt = null
  detailState.error = null
  detailState.loading = false
  detailState.notFound = false
}

function clearSpocData(): void {
  clearSpocCaches()

  state.status = 'idle'
  state.term = null
  state.assignments = []
  state.savedAt = null
  state.error = null
  state.loading = false
  state.hydrated = true
  requestId += 1

  closeDetail()
}

/* ------------------------------- 缓存读写 ------------------------------- */

function readAssignmentsCache(): SpocAssignmentsCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.spocAssignmentsCache)
  if (!isRecord(raw)) return null

  const assignments = Array.isArray(raw.assignments)
    ? raw.assignments
        .map(normalizeAssignment)
        .filter((item): item is SpocAssignment => item !== null)
    : []

  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : ''
  if (savedAt.length === 0 && assignments.length === 0) return null

  return {
    savedAt,
    term: normalizeTerm(raw.term),
    assignments,
  }
}

function persistAssignments(): void {
  if (!state.term || state.savedAt === null) return

  const cache: SpocAssignmentsCache = {
    savedAt: state.savedAt,
    term: state.term,
    assignments: state.assignments,
  }
  writeJson(STORAGE_KEYS.spocAssignmentsCache, cache)
}

function readDetailCache(assignmentId: string): SpocDetailCache | null {
  const raw = readJson<unknown>(spocDetailCacheKey(assignmentId))
  if (!isRecord(raw)) return null

  const assignment = normalizeDetail(raw.assignment)
  if (!assignment) return null

  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : ''
  return { savedAt, assignment }
}

function persistDetail(assignmentId: string): void {
  if (!detailState.assignment || detailState.savedAt === null) return

  const cache: SpocDetailCache = {
    savedAt: detailState.savedAt,
    assignment: detailState.assignment,
  }
  writeJson(spocDetailCacheKey(assignmentId), cache)
}

/* ------------------------------- 归一化 ------------------------------- */

function normalizeAssignment(value: unknown): SpocAssignment | null {
  if (!isRecord(value)) return null

  const assignmentId = asString(value.assignmentId).trim()
  const title = asString(value.title).trim()
  if (assignmentId.length === 0 || title.length === 0) return null

  const status = normalizeSubmissionStatus(value.submissionStatus)

  return {
    assignmentId,
    courseId: asString(value.courseId).trim(),
    courseName: asString(value.courseName).trim() || '未知课程',
    teacherName: nullableText(value.teacherName),
    title,
    startTime: nullableText(value.startTime),
    dueTime: nullableText(value.dueTime),
    submissionStatus: status,
    submissionStatusText: asString(value.submissionStatusText).trim() || submissionStatusText(status),
  }
}

function normalizeDetail(value: unknown): SpocAssignmentDetail | null {
  const base = normalizeAssignment(value)
  if (!base || !isRecord(value)) return null

  const attachments = Array.isArray(value.attachments)
    ? value.attachments
        .map((item) => (isRecord(item) ? asString(item.name).trim() : ''))
        .filter((name) => name.length > 0)
        .map((name) => ({ name }))
    : []

  return {
    ...base,
    score: nullableText(value.score),
    totalScore: nullableText(value.totalScore),
    contentText: nullableText(value.contentText),
    attachments,
    submittedAt: nullableText(value.submittedAt),
  }
}

function normalizeTerm(value: unknown): Term {
  if (!isRecord(value)) return { code: '', name: '' }
  return {
    code: asString(value.code),
    name: asString(value.name),
  }
}

function normalizeSubmissionStatus(value: unknown): SpocAssignment['submissionStatus'] {
  return value === 'submitted' || value === 'unsubmitted' || value === 'unknown'
    ? value
    : 'unknown'
}

function submissionStatusText(status: SpocAssignment['submissionStatus']): string {
  switch (status) {
    case 'submitted':
      return '已提交'
    case 'unsubmitted':
      return '未提交'
    default:
      return '未知'
  }
}

/* ------------------------------- 错误映射 ------------------------------- */

function mapSpocError(error: unknown): MappedError {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NO_CREDENTIAL':
      case 'AUTH_REQUIRED':
        return { status: 'no-credential', message: '未登录，请前往设置完成登录' }
      case 'AUTH_EXPIRED':
        return { status: 'auth-expired', message: '登录状态已失效，请到设置页重新登录' }
      case 'SOURCE_BUSY':
        return { status: 'error', message: '数据源正在派生，请稍后重试' }
      case 'INVALID_REQUEST':
      case 'NOT_FOUND':
        return { status: 'error', message: error.message || '未找到该 SPOC 作业', notFound: true }
      default:
        return { status: 'error', message: error.message || 'SPOC 作业加载失败' }
    }
  }

  return { status: 'error', message: 'SPOC 作业加载失败，请稍后重试' }
}

/* ------------------------------- 基础辅助 ------------------------------- */


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
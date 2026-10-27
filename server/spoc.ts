/**
 * SPOC 上游调用与归一化，见 docs/trd.md 3.2、docs/api.md 2。
 *
 * 只读接口：queryOne（失败回退 queryList）、queryKclb、queryListByPage、
 * queryKczyInfoByid、queryXsSubmitKczyInfo。
 * 本模块不接受任意 URL，所有上游路径都写死在白名单函数里。
 */
import { spocCredentials as sessionSpocCredentials } from './authSession.ts'
import { RelayError } from './errors.ts'
import { fetchUpstream, isTransientStatus, looksLikeHtml } from './http.ts'
import { encryptSpocParam } from './spocCrypto.ts'
import type {
  SpocAssignment,
  SpocAssignmentDetail,
  SpocAssignmentDetailResponse,
  SpocAssignmentsResponse,
  SpocEnvelope,
  SpocStatusResponse,
  Term,
} from './types.ts'

const BASE_URL = 'https://spoc.buaa.edu.cn/spocnewht/'
const REFERER_URL = 'https://spoc.buaa.edu.cn/spocnew/common/zycskzy'

/** docs/api.md 2.2 的固定查询参数，不是部署密钥。 */
const TERM_PARAM =
  'YHrxtTavu6raCwC0/qdgYffB9evWHBkTng/XS4W6j3f/TPo02iEPSoegscDTRNzIPRG49o3RHl4JiFCXAiBkkA=='
const TERM_LIST_PARAM =
  'i7EJ5uwkaEi8s6f4BMZ1s6AGydpvLhbTAgbcrwrBm3mHUdM6nVRsLdleJwUr0EA+yaitJdz0UzXBlTucOn7myg=='
const ASSIGNMENT_SQLID = '1713252980496efac7d5d9985e81693116d3e8a52ebf2b'

const PAGE_SIZE = 15
const MAX_PAGES = 20
const ASSIGNMENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

type SpocCredentials = {
  token: string
  roleCode: string
}

type SpocPage = {
  list: unknown[]
  hasNextPage: boolean
  pages: number
}

type SpocRequest = {
  method?: 'GET' | 'POST'
  query?: URLSearchParams
  body?: unknown
}

/** 从认证会话取 SPOC 凭据；Token 统一补 Inco- 前缀。 */
function requireSpocCredentials(): SpocCredentials {
  const stored = sessionSpocCredentials()
  return {
    token: /^inco-/i.test(stored.token) ? stored.token : `Inco-${stored.token}`,
    roleCode: stored.roleCode,
  }
}

/**
 * 调用 SPOC JSON 接口并检查统一响应信封。
 * 按 docs/trd.md 3.3：3xx、HTML 登录页、非 JSON 都视为认证失效。
 */
async function requestSpoc<T>(
  credentials: SpocCredentials,
  path: string,
  request: SpocRequest = {},
): Promise<T> {
  const url = new URL(path, BASE_URL)
  if (request.query) url.search = request.query.toString()

  const method = request.method ?? 'GET'
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    Token: credentials.token,
    RoleCode: credentials.roleCode,
    'X-Requested-With': 'XMLHttpRequest',
    Referer: REFERER_URL,
  }

  let body: string | undefined
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json;charset=UTF-8'
    headers.Origin = 'https://spoc.buaa.edu.cn'
    body = JSON.stringify(request.body ?? {})
  }

  const result = await fetchUpstream(url.toString(), { method, headers, body })

  if (isTransientStatus(result.status)) {
    throw new RelayError('UPSTREAM_ERROR', 'SPOC 暂时不可用', result.status)
  }

  if (result.status >= 300 && result.status < 400) {
    throw new RelayError('AUTH_EXPIRED', 'SPOC 登录状态已失效', result.status)
  }

  if (result.status < 200 || result.status >= 300) {
    if (looksLikeHtml(result.text)) {
      throw new RelayError('AUTH_EXPIRED', 'SPOC 登录状态已失效', result.status)
    }
    throw new RelayError('UPSTREAM_ERROR', 'SPOC 上游请求失败', result.status)
  }

  if (result.json === undefined) {
    if (looksLikeHtml(result.text)) {
      throw new RelayError('AUTH_EXPIRED', 'SPOC 登录状态已失效', result.status)
    }
    throw new RelayError('BAD_RESPONSE', 'SPOC 上游返回了非 JSON 响应', result.status)
  }

  if (!isRecord(result.json)) {
    throw new RelayError('BAD_RESPONSE', 'SPOC 上游返回了无法识别的响应', result.status)
  }

  const envelope = result.json as unknown as SpocEnvelope<T>
  if (Number(envelope.code) !== 200) {
    const message = typeof envelope.msg === 'string' ? envelope.msg : ''
    if (/登录|token|未认证|未登录|权限/i.test(message)) {
      throw new RelayError('AUTH_EXPIRED', message || 'SPOC 登录状态已失效', result.status)
    }
    throw new RelayError('UPSTREAM_ERROR', message || 'SPOC 上游返回业务错误', result.status)
  }

  return envelope.content
}

async function fetchTerm(credentials: SpocCredentials): Promise<Term> {
  try {
    const content = await requestSpoc<unknown>(credentials, 'inco/ht/queryOne', {
      method: 'POST',
      body: { param: TERM_PARAM },
    })
    const term = readTerm(content)
    if (term) return term
  } catch (error) {
    if (error instanceof RelayError && error.code === 'AUTH_EXPIRED') throw error
  }

  const list = await requestSpoc<unknown>(credentials, 'inco/ht/queryList', {
    method: 'POST',
    body: { param: TERM_LIST_PARAM },
  })

  if (Array.isArray(list)) {
    const current = list.find((item) => isRecord(item) && item.sfdqxq === '1')
    if (isRecord(current)) {
      const code = asString(current.xnxq).trim()
      if (code.length > 0) {
        return { code, name: asString(current.xnxqmc).trim() || code }
      }
    }
  }

  throw new RelayError('UPSTREAM_ERROR', '未获取到 SPOC 当前学期')
}

function readTerm(content: unknown): Term | null {
  if (!isRecord(content)) return null

  const code = asString(content.mrxq).trim()
  const name = asString(content.dqxq).trim()
  if (code.length === 0) return null

  return { code, name: name || code }
}

/** 课程教师表；queryKclb 失败不阻塞作业列表，教师留空。 */
async function fetchCourseTeachers(
  credentials: SpocCredentials,
  termCode: string,
): Promise<Map<string, string>> {
  const teachers = new Map<string, string>()

  try {
    const content = await requestSpoc<unknown>(credentials, 'jxkj/queryKclb', {
      query: new URLSearchParams({ kcmc: '', xnxq: termCode }),
    })
    if (!Array.isArray(content)) return teachers

    for (const item of content) {
      if (!isRecord(item)) continue
      const courseId = asString(item.kcid).trim()
      const teacher = asString(item.skjs).trim()
      if (courseId.length > 0 && teacher.length > 0) {
        teachers.set(courseId, teacher)
      }
    }
  } catch {
    // 教师名是可选字段，查询失败不阻塞作业列表。
  }

  return teachers
}

async function fetchAssignmentList(
  credentials: SpocCredentials,
  termCode: string,
  teachers: ReadonlyMap<string, string>,
): Promise<SpocAssignment[]> {
  const assignments: SpocAssignment[] = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const param = encryptSpocParam({
      pageSize: PAGE_SIZE,
      pageNum: page,
      sqlid: ASSIGNMENT_SQLID,
      xnxq: termCode,
      kcid: '',
      yzwz: '',
    })

    const content = await requestSpoc<unknown>(credentials, 'inco/ht/queryListByPage', {
      method: 'POST',
      body: { param },
    })
    const result = readSpocPage(content)

    for (const raw of result.list) {
      const assignment = normalizeAssignment(raw, teachers)
      if (assignment) assignments.push(assignment)
    }

    if (!result.hasNextPage || page >= result.pages || result.list.length === 0) break
  }

  return sortAssignments(assignments)
}

function readSpocPage(content: unknown): SpocPage {
  if (!isRecord(content)) {
    throw new RelayError('BAD_RESPONSE', 'SPOC 作业分页响应格式异常')
  }

  return {
    list: Array.isArray(content.list) ? content.list : [],
    hasNextPage: content.hasNextPage === true,
    pages: toPositiveInteger(content.pages) ?? MAX_PAGES,
  }
}

function normalizeAssignment(
  value: unknown,
  teachers: ReadonlyMap<string, string>,
): SpocAssignment | null {
  if (!isRecord(value)) return null

  const assignmentId = asString(value.zyid).trim()
  if (assignmentId.length === 0) return null

  const courseId = asString(value.sskcid).trim()
  const status = normalizeSubmissionStatus(value.tjzt)

  return {
    assignmentId,
    courseId,
    courseName: asString(value.kcmc).trim() || '未知课程',
    teacherName: teachers.get(courseId) ?? null,
    title: asString(value.zymc).trim() || '未命名作业',
    startTime: toShanghaiDateTime(value.zykssj),
    dueTime: toShanghaiDateTime(value.zyjzsj),
    submissionStatus: status,
    submissionStatusText: submissionStatusText(status),
  }
}

function normalizeSubmissionStatus(
  value: unknown,
): SpocAssignment['submissionStatus'] {
  const text = asString(value).trim()

  if (text === '1' || text === '已做' || text === '已提交') return 'submitted'
  if (text === '0' || text === '未做' || text === '未提交') return 'unsubmitted'
  return 'unknown'
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

export async function spocStatus(): Promise<SpocStatusResponse> {
  const credentials = requireSpocCredentials()
  const term = await fetchTerm(credentials)
  return { term }
}

export async function spocAssignments(): Promise<SpocAssignmentsResponse> {
  const credentials = requireSpocCredentials()
  const term = await fetchTerm(credentials)
  const teachers = await fetchCourseTeachers(credentials, term.code)
  const assignments = await fetchAssignmentList(credentials, term.code, teachers)

  return { term, assignments }
}

export async function spocAssignmentDetail(
  assignmentId: string,
): Promise<SpocAssignmentDetailResponse> {
  if (!ASSIGNMENT_ID_RE.test(assignmentId)) {
    throw new RelayError('INVALID_REQUEST', '作业 id 格式不正确')
  }

  const credentials = requireSpocCredentials()
  const term = await fetchTerm(credentials)
  const teachers = await fetchCourseTeachers(credentials, term.code)
  const assignments = await fetchAssignmentList(credentials, term.code, teachers)
  const base = assignments.find((item) => item.assignmentId === assignmentId)

  if (!base) {
    throw new RelayError('NOT_FOUND', '未找到该 SPOC 作业')
  }

  const detail = await fetchAssignmentDetail(credentials, assignmentId, base)
  return { assignment: detail }
}

async function fetchAssignmentDetail(
  credentials: SpocCredentials,
  assignmentId: string,
  base: SpocAssignment,
): Promise<SpocAssignmentDetail> {
  const content = await requestSpoc<unknown>(credentials, 'kczy/queryKczyInfoByid', {
    query: new URLSearchParams({ id: assignmentId }),
  })
  const info = isRecord(content) ? content : {}

  const submission = await fetchSubmission(credentials, assignmentId)
  const status = submission?.tjzt
    ? normalizeSubmissionStatus(submission.tjzt)
    : base.submissionStatus

  return {
    ...base,
    submissionStatus: status,
    submissionStatusText: submissionStatusText(status),
    score: nullableText(info.pf),
    totalScore: nullableText(info.zyfs),
    contentText: toPlainText(info.zynr),
    attachments: readAttachments(info),
    submittedAt: submission ? toShanghaiDateTime(submission.tjsj) : null,
  }
}

/** 提交信息失败时保留列表里的提交状态，不阻塞详情。 */
async function fetchSubmission(
  credentials: SpocCredentials,
  assignmentId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const content = await requestSpoc<unknown>(credentials, 'kczy/queryXsSubmitKczyInfo', {
      query: new URLSearchParams({ kczyid: assignmentId }),
    })
    return isRecord(content) ? content : null
  } catch {
    // 提交信息是可选字段，查询失败时保留列表里的提交状态。
    return null
  }
}

function readAttachments(info: Record<string, unknown>): { name: string }[] {
  if (!info.zyfjid) return []

  const attachment = isRecord(info.zyfjInfo) ? info.zyfjInfo : {}
  const name = asString(attachment.wjysmc).trim()

  return [{ name: name.length > 0 ? name : '附件（名称未返回）' }]
}

function toPlainText(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text.length > 0 ? text : null
}

function sortAssignments(assignments: readonly SpocAssignment[]): SpocAssignment[] {
  return [...assignments].sort((left, right) => {
    if (left.dueTime !== right.dueTime) {
      if (left.dueTime === null) return 1
      if (right.dueTime === null) return -1
      return left.dueTime.localeCompare(right.dueTime)
    }

    const byCourse = left.courseName.localeCompare(right.courseName, 'zh-Hans-CN')
    if (byCourse !== 0) return byCourse
    return left.title.localeCompare(right.title, 'zh-Hans-CN')
  })
}

/** 带偏移的 ISO 时间转 Asia/Shanghai 的 "YYYY-MM-DD HH:mm:ss"；无偏移原样保留。 */
function toShanghaiDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const text = value.trim()
  if (text.length === 0) return null
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text

  // 无偏移的 ISO 时间按学校本地时间解释，避免依赖服务器时区。
  const localIso = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?$/)
  if (localIso) {
    return `${localIso[1]} ${localIso[2]}:${localIso[3] ?? '00'}`
  }

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleString('sv-SE', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
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
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
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

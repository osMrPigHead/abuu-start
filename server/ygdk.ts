/**
 * 阳光打卡概览的中继实现，见 docs/api.md 4、docs/trd-phase2.md 3.2 / 3.3。
 *
 * 只读接口：Classify/getList → Clockin/getCount → Term/get（可选）。
 * 不调用 Item/getList、Clockin/getList、Upload/File/post、Clockin/clockin。
 * 上游路径全部写死，不接受任意 URL。
 */
import type { IncomingHttpHeaders } from 'node:http'
import { RelayError } from './errors.ts'
import { fetchUpstream } from './http.ts'
import type { YgdkOverview } from './types.ts'

const BASE_URL = 'https://ygdk.buaa.edu.cn/api'
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded; charset=UTF-8'
const UID_RE = /^\d{1,15}$/

type YgdkCredentials = {
  uid: string
  token: string
}

type YgdkClassify = {
  classifyId: number
  name: string
  termNum: number | null
  weekNum: number | null
}

type YgdkCount = {
  termCount: number | null
  termCountShow: number | null
  termGoodCount: number | null
  termGoodCountShow: number | null
  weekCount: number | null
  weekNum: number | null
  termNum: number | null
}

/** 阳光概览：学期次数/目标 + 当周次数/系统周限制，见 docs/trd-phase2.md 3.2。 */
export async function ygdkOverview(headers: IncomingHttpHeaders): Promise<YgdkOverview> {
  const credentials = requireYgdkCredentials(headers)
  const classify = await fetchClassify(credentials)
  const count = await fetchCount(credentials, classify.classifyId)
  const termName = await fetchTermName(credentials)

  return {
    termName,
    termCount:
      firstInteger([
        count.termGoodCountShow,
        count.termGoodCount,
        count.termCountShow,
        count.termCount,
      ]) ?? 0,
    termTarget: firstInteger([count.termNum, classify.termNum]) ?? 0,
    weekCount: count.weekCount ?? 0,
    weekTarget: firstInteger([count.weekNum, classify.weekNum]) ?? 0,
  }
}

/** 从请求头取 uid/token；uid 必须是十进制整数。 */
function requireYgdkCredentials(headers: IncomingHttpHeaders): YgdkCredentials {
  const uid = readHeader(headers, 'x-ygdk-uid').trim()
  const token = readHeader(headers, 'x-ygdk-token').trim()

  if (uid.length === 0 || token.length === 0) {
    throw new RelayError('NO_CREDENTIAL', '未配置阳光打卡 UID 与 token')
  }

  if (!UID_RE.test(uid)) {
    throw new RelayError('INVALID_REQUEST', '阳光打卡 UID 必须是十进制整数')
  }

  return { uid, token }
}

/**
 * 调用一个阳光表单接口并拆开 `{ code, result }` 信封。
 * 3xx、非 2xx 按上游错误；`code === -98` 按认证失效。
 */
async function requestYgdk(
  credentials: YgdkCredentials,
  path: string,
  form: Record<string, string> = {},
): Promise<unknown> {
  const body = new URLSearchParams(form)
  body.append('uid', credentials.uid)
  body.append('token', credentials.token)

  const result = await fetchUpstream(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': FORM_CONTENT_TYPE,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  })

  if (result.status < 200 || result.status >= 300) {
    throw new RelayError('UPSTREAM_ERROR', '阳光打卡上游请求失败', result.status)
  }

  if (!isRecord(result.json)) {
    throw new RelayError('BAD_RESPONSE', '阳光打卡上游返回了非 JSON 响应', result.status)
  }

  const code = readInteger(result.json.code)
  if (code === -98) {
    throw new RelayError('AUTH_EXPIRED', '阳光打卡登录状态已失效', result.status)
  }

  if (code !== 1) {
    const message = typeof result.json.msg === 'string' ? result.json.msg.trim() : ''
    throw new RelayError('UPSTREAM_ERROR', message || '阳光打卡上游返回业务错误', result.status)
  }

  return result.json.result
}

/** 分类：名称含“体育”优先，其次 classify_id === 1，最后取第一项。 */
async function fetchClassify(credentials: YgdkCredentials): Promise<YgdkClassify> {
  const payload = await requestYgdk(credentials, '/Front/Clockin/Classify/getList')
  const list = isRecord(payload) && Array.isArray(payload.list) ? payload.list : []
  const items = list
    .map(normalizeClassify)
    .filter((item): item is YgdkClassify => item !== null)

  const picked =
    items.find((item) => item.name.includes('体育')) ??
    items.find((item) => item.classifyId === 1) ??
    items[0]

  if (!picked) {
    throw new RelayError('UPSTREAM_ERROR', '未获取到阳光打卡分类')
  }

  return picked
}

async function fetchCount(
  credentials: YgdkCredentials,
  classifyId: number,
): Promise<YgdkCount> {
  const payload = await requestYgdk(credentials, '/Front/Clockin/Clockin/getCount', {
    classify_id: String(classifyId),
    user_id: credentials.uid,
  })

  if (!isRecord(payload)) {
    throw new RelayError('BAD_RESPONSE', '阳光打卡次数响应异常')
  }

  return {
    termCount: readInteger(payload.term_count),
    termCountShow: readInteger(payload.term_count_show),
    termGoodCount: readInteger(payload.term_good_count),
    termGoodCountShow: readInteger(payload.term_good_count_show),
    weekCount: readInteger(payload.week_count),
    weekNum: readInteger(payload.week_num),
    termNum: readInteger(payload.term_num),
  }
}

/** 学期名是可选字段；失败不阻塞概览。 */
async function fetchTermName(credentials: YgdkCredentials): Promise<string | null> {
  try {
    const payload = await requestYgdk(credentials, '/Front/Clockin/Term/get')
    if (!isRecord(payload)) return null

    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    return name.length > 0 ? name : null
  } catch {
    return null
  }
}

function normalizeClassify(value: unknown): YgdkClassify | null {
  if (!isRecord(value)) return null

  const classifyId = readInteger(value.classify_id)
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (classifyId === null || name.length === 0) return null

  return {
    classifyId,
    name,
    termNum: readInteger(value.term_num),
    weekNum: readInteger(value.week_num),
  }
}

function firstInteger(values: readonly (number | null | undefined)[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  }
  return null
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

function readHeader(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name]
  if (Array.isArray(value)) return value.join('; ')
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

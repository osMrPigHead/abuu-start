/** SPOC 作业过滤、排序与展示文案，见 docs/trd.md 7.3。 */
import type { SpocAssignment } from '@/types'
import { pad2 } from '@/utils/date'

const SPOC_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
const SPOC_ASSIGNMENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/** 与中继一致的作业 id 格式校验。 */
export function isValidSpocAssignmentId(value: string): boolean {
  return SPOC_ASSIGNMENT_ID_RE.test(value)
}

/** "YYYY-MM-DD HH:mm:ss"（或带 T）按本地时间解析；无效值返回 null。 */
export function parseSpocDateTime(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null

  const match = SPOC_DATE_TIME_RE.exec(value.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = match[6] === undefined ? 0 : Number(match[6])

  const date = new Date(year, month - 1, day, hour, minute, second, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null
  }

  return date
}

/** "YYYY-MM-DD HH:mm:ss" -> 本地 "YYYY-MM-DD HH:mm"；无效值返回空串。 */
export function formatSpocDateTime(value: string | null): string {
  const date = parseSpocDateTime(value)
  if (!date) return ''

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** 截止时间；无截止时间返回“无截止时间”。 */
export function formatSpocDue(value: string | null): string {
  const text = formatSpocDateTime(value)
  return text.length > 0 ? text : '无截止时间'
}

/** 开始时间；缺失时返回“未知”。 */
export function formatSpocStart(value: string | null): string {
  const text = formatSpocDateTime(value)
  return text.length > 0 ? text : '未知'
}

/** “课程·教师”，教师缺失时不显示占位。 */
export function spocCourseLine(assignment: SpocAssignment): string {
  const teacher = assignment.teacherName?.trim() ?? ''
  return teacher.length > 0 ? `${assignment.courseName}·${teacher}` : assignment.courseName
}

/** 待办段与列表的提交状态标签：未提交 / 未知。 */
export function spocSubmissionLabel(assignment: SpocAssignment): string {
  return assignment.submissionStatus === 'unsubmitted' ? '未提交' : '未知'
}

/** 仅保留未提交且未截止（无截止时间视为未截止）的作业，保持上游顺序。 */
export function filterOpenSpocAssignments(
  assignments: readonly SpocAssignment[],
  now: Date,
): SpocAssignment[] {
  const nowMs = now.getTime()

  return assignments.filter((assignment) => {
    if (assignment.submissionStatus !== 'unsubmitted') return false
    if (assignment.dueTime === null) return true

    const due = parseSpocDateTime(assignment.dueTime)
    return due === null || due.getTime() > nowMs
  })
}

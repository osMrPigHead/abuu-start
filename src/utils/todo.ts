/** 待办草稿校验、排序与展示文案，见 docs/trd.md 7.4。 */
import type { Todo } from '@/types'
import { pad2 } from '@/utils/date'
import { parseLocalDateTime } from '@/utils/repeat'

export type TodoDraft = Pick<Todo, 'title' | 'dueAt' | 'note' | 'priority' | 'repeat'>

export const TODO_PRIORITIES: readonly Todo['priority'][] = ['high', 'medium', 'low']
export const TODO_REPEATS: readonly Todo['repeat'][] = ['none', 'daily', 'weekly']

export function isTodoPriority(value: unknown): value is Todo['priority'] {
  return value === 'high' || value === 'medium' || value === 'low'
}

export function isTodoRepeat(value: unknown): value is Todo['repeat'] {
  return value === 'none' || value === 'daily' || value === 'weekly'
}

export function todoPriorityLabel(priority: Todo['priority']): string {
  switch (priority) {
    case 'high':
      return '高'
    case 'low':
      return '低'
    default:
      return '中'
  }
}

export function todoRepeatLabel(repeat: Todo['repeat']): string {
  switch (repeat) {
    case 'daily':
      return '每天'
    case 'weekly':
      return '每周'
    default:
      return '无'
  }
}

/** 截止时间统一显示为本地 "YYYY-MM-DD HH:mm"；无截止时间返回空串。 */
export function formatTodoDue(dueAt: string | null): string {
  const date = parseLocalDateTime(dueAt)
  if (!date) return ''

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** 返回第一个校验错误；通过时返回 null。 */
export function validateTodoDraft(draft: TodoDraft): string | null {
  if (draft.title.trim().length === 0) return '请输入标题'
  if (!isTodoPriority(draft.priority)) return '优先级不合法'
  if (!isTodoRepeat(draft.repeat)) return '重复方式不合法'

  const dueAt = draft.dueAt?.trim() ?? ''
  if (dueAt.length > 0 && parseLocalDateTime(dueAt) === null) {
    return '截止时间格式不正确'
  }
  if (draft.repeat !== 'none' && dueAt.length === 0) {
    return '重复任务必须设置截止时间'
  }

  return null
}

/** 校验并整理草稿；无效时返回 null。 */
export function normalizeTodoDraft(draft: TodoDraft): TodoDraft | null {
  if (validateTodoDraft(draft) !== null) return null

  const dueAt = draft.dueAt?.trim() ?? ''
  return {
    title: draft.title.trim(),
    dueAt: dueAt.length > 0 ? dueAt : null,
    note: draft.note.trim(),
    priority: draft.priority,
    repeat: draft.repeat,
  }
}

/**
 * 段内排序：未完成在前；截止时间升序；无截止时间置后；已完成置后；
 * 同截止时间按创建时间。优先级不参与排序。
 */
export function sortTodos(todos: readonly Todo[]): Todo[] {
  return [...todos].sort(compareTodos)
}

function compareTodos(left: Todo, right: Todo): number {
  if (left.done !== right.done) return left.done ? 1 : -1

  const leftDue = parseLocalDateTime(left.dueAt)?.getTime() ?? null
  const rightDue = parseLocalDateTime(right.dueAt)?.getTime() ?? null

  if (leftDue !== rightDue) {
    if (leftDue === null) return 1
    if (rightDue === null) return -1
    return leftDue - rightDue
  }

  const byCreatedAt = left.createdAt.localeCompare(right.createdAt)
  if (byCreatedAt !== 0) return byCreatedAt
  return left.id.localeCompare(right.id)
}

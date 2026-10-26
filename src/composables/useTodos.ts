/**
 * 本地待办增删改、重复顺延与排序，见 docs/trd.md 7.4。
 * 模块级单例：主页与其他页面共享同一份待办列表。
 */
import { computed, ref } from 'vue'
import type { Todo } from '@/types'
import { nextRepeatDueAt, parseLocalDateTime } from '@/utils/repeat'
import {
  isTodoPriority,
  isTodoRepeat,
  normalizeTodoDraft,
  sortTodos,
  type TodoDraft,
} from '@/utils/todo'
import { readJson, STORAGE_KEYS, writeJson } from '@/utils/storage'

const todos = ref<Todo[]>([])
let hydrated = false

export function useTodos() {
  hydrate()

  const sortedTodos = computed(() => sortTodos(todos.value))

  function addTodo(draft: TodoDraft): Todo | null {
    hydrate()

    const normalized = normalizeTodoDraft(draft)
    if (!normalized) return null

    const now = new Date()
    const todo: Todo = {
      id: createId(),
      ...normalized,
      done: false,
      completedAt: null,
      createdAt: now.toISOString(),
    }

    todos.value = [...todos.value, todo]
    persist()
    return todo
  }

  function updateTodo(id: string, draft: TodoDraft): boolean {
    hydrate()

    const normalized = normalizeTodoDraft(draft)
    if (!normalized) return false

    let found = false
    todos.value = todos.value.map((todo) => {
      if (todo.id !== id) return todo
      found = true
      return { ...todo, ...normalized }
    })

    if (!found) return false
    persist()
    return true
  }

  function removeTodo(id: string): void {
    hydrate()

    const next = todos.value.filter((todo) => todo.id !== id)
    if (next.length === todos.value.length) return

    todos.value = next
    persist()
  }

  /**
   * 勾选完成：原条目保留为已完成；重复任务按周期生成下一条，
   * 新条目的截止时间顺延到未来最近一次。
   */
  function toggleTodo(id: string): void {
    hydrate()

    const target = todos.value.find((todo) => todo.id === id)
    if (!target) return

    const now = new Date()

    if (target.done) {
      todos.value = todos.value.map((todo) =>
        todo.id === id ? { ...todo, done: false, completedAt: null } : todo,
      )
      persist()
      return
    }

    const nextDueAt =
      target.repeat !== 'none' && target.dueAt
        ? nextRepeatDueAt(target.dueAt, target.repeat, now)
        : null

    const completed: Todo = {
      ...target,
      done: true,
      completedAt: now.toISOString(),
    }
    const replacements: Todo[] = [completed]

    if (nextDueAt !== null) {
      replacements.push({
        ...target,
        id: createId(),
        dueAt: nextDueAt,
        done: false,
        completedAt: null,
        createdAt: now.toISOString(),
      })
    }

    todos.value = [...todos.value.filter((todo) => todo.id !== id), ...replacements]
    persist()
  }

  return {
    todos: sortedTodos,
    hydrate,
    addTodo,
    updateTodo,
    removeTodo,
    toggleTodo,
  }
}

function hydrate(): void {
  if (hydrated) return
  hydrated = true

  const stored = readJson<unknown>(STORAGE_KEYS.todos)
  if (!Array.isArray(stored)) return

  const seen = new Set<string>()
  const result: Todo[] = []

  for (const entry of stored) {
    const todo = normalizeStoredTodo(entry)
    if (!todo || seen.has(todo.id)) continue

    seen.add(todo.id)
    result.push(todo)
  }

  todos.value = result
}

function persist(): void {
  writeJson(STORAGE_KEYS.todos, todos.value)
}

function normalizeStoredTodo(value: unknown): Todo | null {
  if (!isRecord(value)) return null

  const title = asString(value.title).trim()
  if (title.length === 0) return null

  const dueAt = asDueAt(value.dueAt)
  const repeat = isTodoRepeat(value.repeat) ? value.repeat : 'none'

  return {
    id: asString(value.id).trim() || createId(),
    title,
    dueAt,
    note: asString(value.note).trim(),
    priority: isTodoPriority(value.priority) ? value.priority : 'medium',
    // 重复任务必须有截止时间；旧数据缺失时降级为不重复，避免完成时无法顺延。
    repeat: dueAt === null ? 'none' : repeat,
    done: value.done === true,
    completedAt: value.done === true ? asIsoString(value.completedAt) : null,
    createdAt: asIsoString(value.createdAt) ?? new Date().toISOString(),
  }
}

function asDueAt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return parseLocalDateTime(text) ? text : null
}

function asIsoString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 && !Number.isNaN(new Date(text).getTime()) ? text : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

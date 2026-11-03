import { describe, expect, it } from 'vitest'
import type { Todo } from '@/types'
import {
  formatTodoDue,
  isTodoPriority,
  isTodoRepeat,
  normalizeTodoDraft,
  sortTodos,
  todoPriorityLabel,
  todoRepeatLabel,
  validateTodoDraft,
  type TodoDraft,
} from '@/utils/todo'

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'a',
    title: '写作业',
    dueAt: '2026-03-02T08:00',
    note: '',
    priority: 'medium',
    repeat: 'none',
    done: false,
    completedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function draft(overrides: Partial<TodoDraft> = {}): TodoDraft {
  return {
    title: '写作业',
    dueAt: '2026-03-02T08:00',
    note: '',
    priority: 'medium',
    repeat: 'none',
    ...overrides,
  }
}

describe('todo type guards and labels', () => {
  it('isTodoPriority / isTodoRepeat', () => {
    expect(isTodoPriority('high')).toBe(true)
    expect(isTodoPriority('medium')).toBe(true)
    expect(isTodoPriority('low')).toBe(true)
    expect(isTodoPriority('urgent')).toBe(false)
    expect(isTodoRepeat('none')).toBe(true)
    expect(isTodoRepeat('daily')).toBe(true)
    expect(isTodoRepeat('weekly')).toBe(true)
    expect(isTodoRepeat('monthly')).toBe(false)
  })

  it('todoPriorityLabel / todoRepeatLabel', () => {
    expect(todoPriorityLabel('high')).toBe('高')
    expect(todoPriorityLabel('medium')).toBe('中')
    expect(todoPriorityLabel('low')).toBe('低')
    expect(todoRepeatLabel('none')).toBe('无')
    expect(todoRepeatLabel('daily')).toBe('每天')
    expect(todoRepeatLabel('weekly')).toBe('每周')
  })
})

describe('formatTodoDue', () => {
  it('合法时间格式化为本地 YYYY-MM-DD HH:mm', () => {
    expect(formatTodoDue('2026-03-02T08:05')).toBe('2026-03-02 08:05')
    expect(formatTodoDue('2026-03-02T08:05:06')).toBe('2026-03-02 08:05')
  })

  it('无截止时间或非法时间返回空串', () => {
    expect(formatTodoDue(null)).toBe('')
    expect(formatTodoDue('bad')).toBe('')
  })
})

describe('validateTodoDraft', () => {
  it('合法草稿返回 null', () => {
    expect(validateTodoDraft(draft())).toBeNull()
  })

  it('标题为空时报错', () => {
    expect(validateTodoDraft(draft({ title: '   ' }))).toBe('请输入标题')
  })

  it('优先级和重复方式非法时报错', () => {
    expect(validateTodoDraft(draft({ priority: 'urgent' as Todo['priority'] }))).toBe(
      '优先级不合法',
    )
    expect(validateTodoDraft(draft({ repeat: 'monthly' as Todo['repeat'] }))).toBe(
      '重复方式不合法',
    )
  })

  it('截止时间格式非法或重复任务缺截止时间时报错', () => {
    expect(validateTodoDraft(draft({ dueAt: '2026-02-30T08:00' }))).toBe(
      '截止时间格式不正确',
    )
    expect(validateTodoDraft(draft({ dueAt: null, repeat: 'daily' }))).toBe(
      '重复任务必须设置截止时间',
    )
  })
})

describe('normalizeTodoDraft', () => {
  it('去除标题和备注首尾空格', () => {
    expect(
      normalizeTodoDraft(draft({ title: '  写作业  ', note: '  备注  ' })),
    ).toEqual({
      title: '写作业',
      dueAt: '2026-03-02T08:00',
      note: '备注',
      priority: 'medium',
      repeat: 'none',
    })
  })

  it('空截止时间归一为 null', () => {
    expect(normalizeTodoDraft(draft({ dueAt: '   ' }))?.dueAt).toBeNull()
  })

  it('非法草稿返回 null', () => {
    expect(normalizeTodoDraft(draft({ title: ' ' }))).toBeNull()
  })
})

describe('sortTodos', () => {
  it('未完成优先，截止时间升序，无截止时间置后', () => {
    const items = [
      todo({ id: 'done', done: true, dueAt: '2026-03-01T08:00' }),
      todo({ id: 'later', dueAt: '2026-03-03T08:00' }),
      todo({ id: 'none', dueAt: null }),
      todo({ id: 'soon', dueAt: '2026-03-02T08:00' }),
    ]
    expect(sortTodos(items).map((item) => item.id)).toEqual(['soon', 'later', 'none', 'done'])
  })

  it('同截止时间按创建时间和 id 排序', () => {
    const items = [
      todo({ id: 'b', createdAt: '2026-03-01T00:00:00.000Z' }),
      todo({ id: 'a', createdAt: '2026-03-01T00:00:00.000Z' }),
      todo({ id: 'c', createdAt: '2026-02-28T00:00:00.000Z' }),
    ]
    expect(sortTodos(items).map((item) => item.id)).toEqual(['c', 'a', 'b'])
  })

  it('不修改原数组', () => {
    const items = [todo({ id: 'b' }), todo({ id: 'a' })]
    const sorted = sortTodos(items)
    expect(sorted).not.toBe(items)
    expect(items.map((item) => item.id)).toEqual(['b', 'a'])
  })
})

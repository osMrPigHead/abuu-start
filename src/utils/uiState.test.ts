import { describe, expect, it } from 'vitest'
import {
  cacheBadge,
  canRetrySource,
  needsSettingsSource,
  resolveAggregateSourceBadge,
  resolveSourceBadge,
} from '@/utils/sourceStatus'
import {
  HOME_ROW_COUNT,
  computeHomeLayout,
  type HomeCardVisibility,
} from '@/utils/homeLayout'
import {
  normalizeShortcutRow,
  normalizeShortcutUrl,
  shortcutWidthRem,
} from '@/utils/shortcut'
import { faviconUrlFor, shortcutInitial } from '@/utils/favicon'

function visibility(overrides: Partial<HomeCardVisibility> = {}): HomeCardVisibility {
  return {
    schedule: true,
    bykc: true,
    todo: true,
    focus: true,
    ygdk: true,
    ...overrides,
  }
}

describe('source status', () => {
  it('cacheBadge 显示缓存时间或兜底文案', () => {
    expect(cacheBadge(new Date(2026, 2, 2, 8, 5).toISOString())).toBe(
      '缓存于 2026-03-02 08:05',
    )
    expect(cacheBadge(null)).toBe('缓存')
  })

  it('resolveSourceBadge 按规定优先级返回标签', () => {
    expect(resolveSourceBadge({ status: 'auth-expired', savedAt: null, loading: true })).toBe(
      '已失效',
    )
    expect(resolveSourceBadge({ status: 'no-credential', savedAt: null, loading: true })).toBe(
      '未登录',
    )
    expect(resolveSourceBadge({ status: 'error', savedAt: null, loading: false })).toBe(
      '加载失败',
    )
    expect(resolveSourceBadge({ status: 'ok', savedAt: null, loading: true })).toBe('同步中')
    expect(
      resolveSourceBadge({
        status: 'cached',
        savedAt: new Date(2026, 2, 2, 8, 5).toISOString(),
        loading: false,
      }),
    ).toBe('缓存于 2026-03-02 08:05')
    expect(resolveSourceBadge({ status: 'ok', savedAt: null, loading: false })).toBe('已同步')
    expect(resolveSourceBadge({ status: 'idle', savedAt: null, loading: false })).toBe(
      '待接入',
    )
  })

  it('resolveAggregateSourceBadge 聚合多个数据源', () => {
    expect(resolveAggregateSourceBadge([])).toBe('待接入')
    expect(
      resolveAggregateSourceBadge([
        { status: 'error', savedAt: null, loading: false },
        { status: 'auth-expired', savedAt: null, loading: false },
      ]),
    ).toBe('已失效')
    expect(
      resolveAggregateSourceBadge([
        { status: 'cached', savedAt: new Date(2026, 2, 2, 8, 5).toISOString(), loading: false },
        { status: 'cached', savedAt: new Date(2026, 1, 1, 8, 0).toISOString(), loading: false },
      ]),
    ).toBe('缓存于 2026-02-01 08:00')
    expect(
      resolveAggregateSourceBadge([
        { status: 'ok', savedAt: null, loading: false },
        { status: 'ok', savedAt: null, loading: false },
      ]),
    ).toBe('已同步')
    expect(
      resolveAggregateSourceBadge([
        { status: 'ok', savedAt: null, loading: false },
        { status: 'idle', savedAt: null, loading: false },
      ]),
    ).toBe('待接入')
  })

  it('canRetrySource / needsSettingsSource', () => {
    expect(canRetrySource({ status: 'error', error: null })).toBe(true)
    expect(canRetrySource({ status: 'cached', error: 'boom' })).toBe(true)
    expect(canRetrySource({ status: 'cached', error: null })).toBe(false)
    expect(needsSettingsSource({ status: 'no-credential' })).toBe(true)
    expect(needsSettingsSource({ status: 'auth-expired' })).toBe(true)
    expect(needsSettingsSource({ status: 'ok' })).toBe(false)
  })
})

describe('home layout', () => {
  it('五张卡片全部开启时使用固定布局', () => {
    const layout = computeHomeLayout(visibility())
    expect(layout.placements.schedule).toMatchObject({ row: 0, rows: 5, xRem: 0 })
    expect(layout.placements.todo).toMatchObject({ row: 5, rows: 6, xRem: 0 })
    expect(layout.placements.bykc).toMatchObject({ row: 0, rows: 5, xRem: 36.75 })
    expect(layout.placements.focus).toMatchObject({ row: 5, rows: 4, xRem: 36.75 })
    expect(layout.placements.ygdk).toMatchObject({ row: 9, rows: 2, xRem: 36.75 })
    expect(layout.rowEnds).toHaveLength(HOME_ROW_COUNT)
    expect(layout.rowStarts.every((start) => Math.abs(start - 59.9) < 0.001)).toBe(true)
    expect(layout.boardWidthRem).toBeCloseTo(67.4, 6)
  })

  it('关闭卡片后同列后续卡片上移', () => {
    const layout = computeHomeLayout(visibility({ schedule: false, bykc: false }))
    expect(layout.placements.schedule).toBeUndefined()
    expect(layout.placements.bykc).toBeUndefined()
    expect(layout.placements.todo).toMatchObject({ row: 0, xRem: 0 })
    expect(layout.placements.focus).toMatchObject({ row: 0, xRem: 36.75 })
    expect(layout.placements.ygdk).toMatchObject({ row: 4, xRem: 36.75 })
  })

  it('全部关闭时只保留快捷方式最小画布宽度', () => {
    const layout = computeHomeLayout(
      visibility({ schedule: false, bykc: false, todo: false, focus: false, ygdk: false }),
    )
    expect(layout.placements).toEqual({})
    expect(layout.rowEnds.every((end) => end === 0)).toBe(true)
    expect(layout.rowStarts.every((start) => start === 0)).toBe(true)
    expect(layout.boardWidthRem).toBe(7.5)
  })

  it('仅左列或仅右列时分别从 0 开始或紧贴左列', () => {
    const leftOnly = computeHomeLayout(
      visibility({ bykc: false, focus: false, ygdk: false }),
    )
    expect(leftOnly.rowStarts.every((start) => start === 36.75)).toBe(true)
    expect(leftOnly.boardWidthRem).toBe(44.25)

    const rightOnly = computeHomeLayout(
      visibility({ schedule: false, todo: false }),
    )
    expect(rightOnly.placements.bykc).toMatchObject({ xRem: 0 })
    expect(rightOnly.rowStarts[0]).toBeCloseTo(23.15, 6)
  })
})

describe('shortcut utils', () => {
  it('normalizeShortcutUrl 只接受绝对 http(s)', () => {
    expect(normalizeShortcutUrl(' https://example.com ')).toBe('https://example.com/')
    expect(normalizeShortcutUrl('http://example.com/path?x=1')).toBe(
      'http://example.com/path?x=1',
    )
    expect(normalizeShortcutUrl('ftp://example.com')).toBeNull()
    expect(normalizeShortcutUrl('example.com')).toBeNull()
    expect(normalizeShortcutUrl('')).toBeNull()
  })

  it('normalizeShortcutRow 截断并钳制行号', () => {
    expect(normalizeShortcutRow(5)).toBe(5)
    expect(normalizeShortcutRow(3.9)).toBe(3)
    expect(normalizeShortcutRow(-1)).toBe(0)
    expect(normalizeShortcutRow(99)).toBe(10)
    expect(normalizeShortcutRow(Number.NaN, 4)).toBe(4)
  })

  it('shortcutWidthRem 按标题估算并钳制', () => {
    expect(shortcutWidthRem('')).toBe(7.5)
    expect(shortcutWidthRem('abcdefghi')).toBe(8.38)
    expect(shortcutWidthRem('一二三四五')).toBe(8.07)
    expect(shortcutWidthRem('这是一个非常非常非常长的标题')).toBe(10.5)
    expect(shortcutWidthRem('abcdefghi', true)).toBe(10.5)
  })
})

describe('favicon utils', () => {
  it('faviconUrlFor 只接受 http(s)', () => {
    expect(faviconUrlFor('https://example.com/path')).toBe(
      'https://example.com/favicon.ico',
    )
    expect(faviconUrlFor('http://example.com')).toBe('http://example.com/favicon.ico')
    expect(faviconUrlFor('ftp://example.com')).toBeNull()
    expect(faviconUrlFor('bad')).toBeNull()
  })

  it('shortcutInitial 返回首字符的大写形式', () => {
    expect(shortcutInitial('北航')).toBe('北')
    expect(shortcutInitial('abc')).toBe('A')
    expect(shortcutInitial('😀表情')).toBe('😀')
    expect(shortcutInitial('   ')).toBe('?')
  })
})

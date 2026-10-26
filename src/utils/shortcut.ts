/** 快捷方式 URL 校验、行号与卡片宽度估算。 */

export type ShortcutDraft = {
  title: string
  url: string
}

/** 功能区固定 10 行，快捷方式可以放在任意一行。 */
export const SHORTCUT_ROW_COUNT = 10

/** 只接受绝对 http(s) 链接，返回规范化后的 href。 */
export function normalizeShortcutUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return parsed.href
}

export function normalizeShortcutRow(value: unknown, fallback = 0): number {
  const fallbackRow =
    typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : 0
  const row =
    typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallbackRow
  return Math.min(SHORTCUT_ROW_COUNT - 1, Math.max(0, row))
}

export const SHORTCUT_MIN_WIDTH_REM = 7.5

const MAX_WIDTH_REM = 10.5
const CARD_BASE_WIDTH_REM = 3.875
const EDIT_CONTROL_WIDTH_REM = 2.5
const WIDE_CHAR_REM = 0.84
const NARROW_CHAR_REM = 0.5

/**
 * 按标题估算卡片宽度，避免 DOM 测量：
 * 图标、内边距、间距占固定宽度，标题按中日韩字符/其他字符累加。
 * 编辑态额外为右侧编辑按钮留出空间。
 */
export function shortcutWidthRem(title: string, editing = false): number {
  let textWidth = 0
  for (const char of title) {
    textWidth += WIDE_CHAR_RE.test(char) ? WIDE_CHAR_REM : NARROW_CHAR_REM
  }

  const natural =
    CARD_BASE_WIDTH_REM + textWidth + (editing ? EDIT_CONTROL_WIDTH_REM : 0)
  const clamped = Math.min(
    MAX_WIDTH_REM,
    Math.max(SHORTCUT_MIN_WIDTH_REM, natural),
  )
  return Math.round(clamped * 100) / 100
}

const WIDE_CHAR_RE =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6b\uff01-\uff60]/

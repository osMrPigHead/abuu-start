import { readonly, ref } from 'vue'
import type { Shortcut } from '@/types'
import {
  normalizeShortcutRow,
  normalizeShortcutUrl,
  SHORTCUT_ROW_COUNT,
  type ShortcutDraft,
} from '@/utils/shortcut'
import { readJson, STORAGE_KEYS, writeJson } from '@/utils/storage'

/** 预置快捷方式，见 docs/prd.md 3.2；默认分到前两行。 */
const PRESET_SHORTCUTS: readonly Shortcut[] = [
  { id: 'preset-it', title: '智慧北航', url: 'https://it.buaa.edu.cn/', row: 0 },
  { id: 'preset-spoc', title: 'SPOC', url: 'https://spoc.buaa.edu.cn/', row: 1 },
  { id: 'preset-bykc', title: '博雅课程', url: 'https://bykc.buaa.edu.cn/', row: 2 },
  { id: 'preset-ygdk', title: '阳光打卡', url: 'https://ygdk.buaa.edu.cn/', row: 3 },
]

/** 旧数据没有 row 字段时的迁移密度。 */
const LEGACY_SHORTCUTS_PER_ROW = 4

const shortcuts = ref<Shortcut[]>(loadShortcuts())

/** 模块级单例：主页与其他页面共享同一份快捷方式列表。 */
export function useShortcuts() {
  function addShortcut(draft: ShortcutDraft, row = 0): Shortcut | null {
    const normalized = normalizeDraft(draft)
    if (!normalized) return null

    const shortcut: Shortcut = {
      id: createId(),
      ...normalized,
      row: normalizeShortcutRow(row),
    }
    shortcuts.value = [...shortcuts.value, shortcut]
    persist()
    return shortcut
  }

  function updateShortcut(id: string, draft: ShortcutDraft): boolean {
    const normalized = normalizeDraft(draft)
    if (!normalized) return false

    let found = false
    shortcuts.value = shortcuts.value.map((shortcut) => {
      if (shortcut.id !== id) return shortcut
      found = true
      return { ...shortcut, ...normalized }
    })

    if (!found) return false
    persist()
    return true
  }

  function removeShortcut(id: string): void {
    const next = shortcuts.value.filter((shortcut) => shortcut.id !== id)
    if (next.length === shortcuts.value.length) return

    shortcuts.value = next
    persist()
  }

  /**
   * 把 source 放到指定行的指定序号；序号按该行内其余快捷方式计算。
   * 每行独立排序，行内顺序由 shortcuts 数组的全局顺序过滤得到。
   */
  function moveShortcutTo(
    sourceId: string,
    targetRow: number,
    targetIndex: number,
  ): void {
    const next = [...shortcuts.value]
    const sourceIndex = next.findIndex((shortcut) => shortcut.id === sourceId)
    if (sourceIndex < 0) return

    const [moved] = next.splice(sourceIndex, 1)
    if (!moved) return

    const row = normalizeShortcutRow(targetRow)
    const rowItems = next.filter((shortcut) => shortcut.row === row)
    const insertAt = Math.max(0, Math.min(targetIndex, rowItems.length))
    const updated: Shortcut = { ...moved, row }

    if (insertAt >= rowItems.length) {
      const last = rowItems[rowItems.length - 1]
      if (last) {
        const lastIndex = next.findIndex((shortcut) => shortcut.id === last.id)
        next.splice(lastIndex + 1, 0, updated)
      } else {
        next.push(updated)
      }
    } else {
      const target = rowItems[insertAt]
      const targetGlobalIndex = target
        ? next.findIndex((shortcut) => shortcut.id === target.id)
        : -1
      if (targetGlobalIndex < 0) {
        next.push(updated)
      } else {
        next.splice(targetGlobalIndex, 0, updated)
      }
    }

    shortcuts.value = next
    persist()
  }

  return {
    shortcuts: readonly(shortcuts),
    addShortcut,
    updateShortcut,
    removeShortcut,
    moveShortcutTo,
  }
}

function loadShortcuts(): Shortcut[] {
  const stored = readJson<unknown>(STORAGE_KEYS.shortcuts)
  if (stored === null) return createPresetShortcuts()
  if (!Array.isArray(stored)) return createPresetShortcuts()

  const seen = new Set<string>()
  const result: Shortcut[] = []

  for (const [index, entry] of stored.entries()) {
    if (typeof entry !== 'object' || entry === null) continue

    const candidate = entry as Partial<Shortcut>
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
    const url =
      typeof candidate.url === 'string' ? normalizeShortcutUrl(candidate.url) : null
    if (title.length === 0 || !url) continue

    const id =
      typeof candidate.id === 'string' && candidate.id.length > 0
        ? candidate.id
        : createId()
    if (seen.has(id)) continue

    const fallbackRow = Math.min(
      Math.floor(index / LEGACY_SHORTCUTS_PER_ROW),
      SHORTCUT_ROW_COUNT - 1,
    )
    seen.add(id)
    result.push({
      id,
      title,
      url,
      row: normalizeShortcutRow(candidate.row, fallbackRow),
    })
  }

  return result
}

function normalizeDraft(draft: ShortcutDraft): ShortcutDraft | null {
  const title = draft.title.trim()
  const url = normalizeShortcutUrl(draft.url)
  if (title.length === 0 || !url) return null
  return { title, url }
}

function createPresetShortcuts(): Shortcut[] {
  return PRESET_SHORTCUTS.map((shortcut) => ({ ...shortcut }))
}

function persist(): void {
  writeJson(STORAGE_KEYS.shortcuts, shortcuts.value)
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `shortcut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

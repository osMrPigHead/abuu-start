/** 日程高亮偏好：提前多少分钟开始高亮，默认 30 分钟。 */
import { computed, reactive } from 'vue'
import {
  DEFAULT_HIGHLIGHT_LEAD_MINUTES,
  MAX_HIGHLIGHT_LEAD_MINUTES,
  MIN_HIGHLIGHT_LEAD_MINUTES,
} from '@/utils/schedule'
import { readJson, STORAGE_KEYS, writeJson } from '@/utils/storage'

const state = reactive({
  highlightLeadMinutes: loadHighlightLeadMinutes(),
})

export function useScheduleSettings() {
  return {
    highlightLeadMinutes: computed(() => state.highlightLeadMinutes),
    setHighlightLeadMinutes(value: number): boolean {
      if (!isValidHighlightLeadMinutes(value)) return false

      state.highlightLeadMinutes = value
      return writeJson(STORAGE_KEYS.scheduleHighlightLeadMinutes, value)
    },
  }
}

export function isValidHighlightLeadMinutes(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_HIGHLIGHT_LEAD_MINUTES &&
    value <= MAX_HIGHLIGHT_LEAD_MINUTES
  )
}

function loadHighlightLeadMinutes(): number {
  const stored = readJson<unknown>(STORAGE_KEYS.scheduleHighlightLeadMinutes)
  const number =
    typeof stored === 'number'
      ? stored
      : typeof stored === 'string' && stored.trim().length > 0
        ? Number(stored)
        : Number.NaN

  return isValidHighlightLeadMinutes(number) ? number : DEFAULT_HIGHLIGHT_LEAD_MINUTES
}

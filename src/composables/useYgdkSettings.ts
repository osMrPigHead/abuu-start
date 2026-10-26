/** 阳光打卡目标偏好：学期目标 1–100（默认 20）、周限制 1–14（默认 4）。 */
import { computed, reactive } from 'vue'
import type { YgdkSettings } from '@/types'
import { readJson, STORAGE_KEYS, writeJson } from '@/utils/storage'
import {
  DEFAULT_YGDK_SETTINGS,
  isValidYgdkTermTarget,
  isValidYgdkWeekTarget,
} from '@/utils/ygdk'

const state = reactive<YgdkSettings>(loadSettings())

export function useYgdkSettings() {
  return {
    termTarget: computed(() => state.termTarget),
    weekTarget: computed(() => state.weekTarget),
    setTermTarget(value: number): boolean {
      if (!isValidYgdkTermTarget(value)) return false

      state.termTarget = value
      return persist()
    },
    setWeekTarget(value: number): boolean {
      if (!isValidYgdkWeekTarget(value)) return false

      state.weekTarget = value
      return persist()
    },
  }
}

function persist(): boolean {
  return writeJson(STORAGE_KEYS.ygdkSettings, {
    termTarget: state.termTarget,
    weekTarget: state.weekTarget,
  } satisfies YgdkSettings)
}

function loadSettings(): YgdkSettings {
  const stored = readJson<unknown>(STORAGE_KEYS.ygdkSettings)
  const record = isRecord(stored) ? stored : {}

  return {
    termTarget: readTarget(
      record.termTarget,
      isValidYgdkTermTarget,
      DEFAULT_YGDK_SETTINGS.termTarget,
    ),
    weekTarget: readTarget(
      record.weekTarget,
      isValidYgdkWeekTarget,
      DEFAULT_YGDK_SETTINGS.weekTarget,
    ),
  }
}

function readTarget(
  value: unknown,
  isValid: (candidate: number) => boolean,
  fallback: number,
): number {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN

  return isValid(number) ? number : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

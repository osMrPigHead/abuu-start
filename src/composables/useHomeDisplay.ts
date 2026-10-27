/** 主页显示状态：仅时钟与背景模式、功能区与功能按钮开关，见 docs/trd-phase3.md 7.4。 */
import { reactive } from 'vue'
import { readJson, STORAGE_KEYS, writeJson } from '@/utils/storage'

export type HomeDisplayState = {
  /** 隐藏功能区（五张卡片与快捷方式），时钟行与搜索框保留。 */
  showFunctionArea: boolean
  /** 显示设置/新建/编辑按钮；“仅时钟”按钮不受影响。 */
  showActionButtons: boolean
  /** 仅时钟与背景模式，只在 `/` 生效。 */
  minimalMode: boolean
}

const state = reactive<HomeDisplayState>(loadDisplay())

export function useHomeDisplay() {
  return {
    display: state,
    setMinimalMode,
    enterMinimalMode,
    exitMinimalMode,
    setShowFunctionArea,
    setShowActionButtons,
  }
}

function setMinimalMode(value: boolean): boolean {
  state.minimalMode = value
  return persist()
}

function enterMinimalMode(): boolean {
  return setMinimalMode(true)
}

function exitMinimalMode(): boolean {
  return setMinimalMode(false)
}

function setShowFunctionArea(value: boolean): boolean {
  state.showFunctionArea = value
  return persist()
}

function setShowActionButtons(value: boolean): boolean {
  state.showActionButtons = value
  return persist()
}

function persist(): boolean {
  return writeJson(STORAGE_KEYS.homeDisplay, { ...state })
}

/** 非法或缺省值按默认值处理：功能区与功能按钮开启，仅时钟模式关闭。 */
function loadDisplay(): HomeDisplayState {
  const stored = readJson<unknown>(STORAGE_KEYS.homeDisplay)
  const record = isRecord(stored) ? stored : {}

  return {
    showFunctionArea: record.showFunctionArea !== false,
    showActionButtons: record.showActionButtons !== false,
    minimalMode: record.minimalMode === true,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

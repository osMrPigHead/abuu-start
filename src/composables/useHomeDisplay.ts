/** 主页显示状态：仅时钟与背景模式，见 docs/prd.md 3.12、docs/trd.md 7.4。 */
import { reactive } from "vue";
import { isRecord } from "@/utils/guards";
import { readJson, STORAGE_KEYS, writeJson } from "@/cache/storage";

export type HomeDisplayState = {
  /** 仅时钟与背景模式，只在 `/` 生效。 */
  minimalMode: boolean;
};

const state = reactive<HomeDisplayState>(loadDisplay());

export function useHomeDisplay() {
  return {
    display: state,
    setMinimalMode,
    enterMinimalMode,
    exitMinimalMode,
  };
}

function setMinimalMode(value: boolean): boolean {
  state.minimalMode = value;
  return persist();
}

function enterMinimalMode(): boolean {
  return setMinimalMode(true);
}

function exitMinimalMode(): boolean {
  return setMinimalMode(false);
}

function persist(): boolean {
  return writeJson(STORAGE_KEYS.homeDisplay, { ...state });
}

/** 非法或缺省值按默认值处理：仅时钟模式关闭。 */
function loadDisplay(): HomeDisplayState {
  const stored = readJson<unknown>(STORAGE_KEYS.homeDisplay);
  const record = isRecord(stored) ? stored : {};

  return { minimalMode: record.minimalMode === true };
}

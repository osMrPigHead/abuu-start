/** 主页卡片开关：五张功能卡片可单独关闭，见 docs/prd-phase3.md 4.3 与 docs/ui-lowfi.md。 */
import { reactive } from 'vue'
import type { HomeCardId, HomeCardVisibility } from '@/utils/homeLayout'
import { readJson, STORAGE_KEYS, writeJson } from '@/utils/storage'

export type { HomeCardId, HomeCardVisibility }

/** 设置页展示顺序与说明，与主页布局无关。 */
export const HOME_CARD_OPTIONS: readonly {
  id: HomeCardId
  title: string
  hint: string
}[] = [
  { id: 'schedule', title: '日程', hint: '今日/明日课程、下一节课与考试区' },
  { id: 'bykc', title: '博雅课程广场', hint: '课程推荐与「换一批」' },
  { id: 'todo', title: '待办', hint: '本地待办与 SPOC 作业段' },
  { id: 'focus', title: '专注', hint: '番茄钟计时' },
  { id: 'ygdk', title: '阳光打卡', hint: '学期与本周进度' },
]

const state = reactive<HomeCardVisibility>(loadVisibility())

export function useHomeCards() {
  return {
    visibility: state,
    setVisible(id: HomeCardId, value: boolean): boolean {
      state[id] = value
      return writeJson(STORAGE_KEYS.homeCards, { ...state })
    },
  }
}

/** 未保存或字段非法时视为开启，保证默认五张卡片全部显示。 */
function loadVisibility(): HomeCardVisibility {
  const stored = readJson<unknown>(STORAGE_KEYS.homeCards)
  const record = isRecord(stored) ? stored : {}

  const visibility = {} as HomeCardVisibility
  for (const option of HOME_CARD_OPTIONS) {
    visibility[option.id] = record[option.id] !== false
  }
  return visibility
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

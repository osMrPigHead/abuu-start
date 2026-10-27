/** 主页功能区布局：卡片开关后的重排规则，见 docs/ui-lowfi.md 主页。 */
import { SHORTCUT_MIN_WIDTH_REM, SHORTCUT_ROW_COUNT } from '@/utils/shortcut'

export type HomeCardId = 'schedule' | 'bykc' | 'todo' | 'focus' | 'ygdk'

export type HomeCardVisibility = Record<HomeCardId, boolean>

export type PlacementGeometry = {
  /** 起始行，0 起 */
  row: number
  rows: number
  /** 距功能区左缘 */
  xRem: number
  widthRem: number
}

export type HomeCardPlacement = PlacementGeometry & {
  id: HomeCardId
}

/** 功能区行数与行高，快捷方式与功能卡片共用。 */
export const HOME_ROW_COUNT = SHORTCUT_ROW_COUNT
export const HOME_ROW_HEIGHT_REM = 3
export const HOME_ROW_GAP_REM = 0.75

type HomeCardDef = {
  id: HomeCardId
  column: 'left' | 'right'
  rows: number
  widthRem: number
}

/**
 * 数组顺序即列内自上而下的顺序。
 * 五张卡片全部开启时与 ui-lowfi 的固定布局一致：
 * 左列日程 5 行 + 待办 6 行，右列博雅 5 行 + 专注 4 行 + 阳光 2 行。
 */
const HOME_CARD_DEFS: readonly HomeCardDef[] = [
  { id: 'schedule', column: 'left', rows: 5, widthRem: 36 },
  { id: 'bykc', column: 'right', rows: 5, widthRem: 22.4 },
  { id: 'todo', column: 'left', rows: 6, widthRem: 36 },
  { id: 'focus', column: 'right', rows: 4, widthRem: 22.4 },
  { id: 'ygdk', column: 'right', rows: 2, widthRem: 22.4 },
]

export type HomeLayout = {
  placements: Partial<Record<HomeCardId, HomeCardPlacement>>
  /** 每行已被大卡占用的右缘，0 表示该行没有大卡。 */
  rowEnds: number[]
  /** 每行快捷方式的起始横坐标；没有大卡的行从 0 开始。 */
  rowStarts: number[]
  boardWidthRem: number
}

/**
 * 关闭的卡片不占位：同列后续卡片上移，功能区仍为固定行数。
 * 右列卡片紧贴起始行不晚于它的最后一张左列大卡的右缘；左列为空时从最左侧开始。
 */
export function computeHomeLayout(visibility: HomeCardVisibility): HomeLayout {
  const leftPlacements: HomeCardPlacement[] = []
  let leftBottom = 0

  for (const def of HOME_CARD_DEFS) {
    if (def.column !== 'left' || !visibility[def.id]) continue

    leftPlacements.push({
      id: def.id,
      row: leftBottom,
      rows: def.rows,
      xRem: 0,
      widthRem: def.widthRem,
    })
    leftBottom += def.rows
  }

  const placements: Partial<Record<HomeCardId, HomeCardPlacement>> = {}
  for (const placement of leftPlacements) placements[placement.id] = placement

  let rightBottom = 0
  for (const def of HOME_CARD_DEFS) {
    if (def.column !== 'right' || !visibility[def.id]) continue

    const reference = lastLeftAbove(leftPlacements, rightBottom)
    const xRem = reference
      ? reference.xRem + reference.widthRem + HOME_ROW_GAP_REM
      : 0

    placements[def.id] = {
      id: def.id,
      row: rightBottom,
      rows: def.rows,
      xRem,
      widthRem: def.widthRem,
    }
    rightBottom += def.rows
  }

  const rowEnds = Array.from({ length: HOME_ROW_COUNT }, () => 0)
  for (const placement of Object.values(placements)) {
    if (!placement) continue

    const end = placement.xRem + placement.widthRem
    const lastRow = Math.min(HOME_ROW_COUNT, placement.row + placement.rows)
    for (let row = placement.row; row < lastRow; row += 1) {
      rowEnds[row] = Math.max(rowEnds[row] ?? 0, end)
    }
  }

  const rowStarts = rowEnds.map((end) => (end > 0 ? end + HOME_ROW_GAP_REM : 0))

  // 画布至少要能让任意一行放下第一张快捷方式，即使该行没有任何大卡。
  const boardWidthRem = Math.max(
    ...rowEnds,
    ...rowStarts.map((start) => start + SHORTCUT_MIN_WIDTH_REM),
  )

  return { placements, rowEnds, rowStarts, boardWidthRem }
}

/** 起始行不晚于给定行的最后一张左列卡片。 */
function lastLeftAbove(
  placements: readonly HomeCardPlacement[],
  row: number,
): HomeCardPlacement | null {
  let found: HomeCardPlacement | null = null

  for (const placement of placements) {
    if (placement.row <= row) found = placement
  }

  return found
}

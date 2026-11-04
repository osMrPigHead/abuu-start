/** 主页功能区布局几何与快捷方式排列，见 docs/ui-lowfi.md 主页。 */
import { computed, type CSSProperties } from "vue";
import type { Shortcut } from "@/types";
import {
  computeHomeLayout,
  HOME_ROW_COUNT,
  HOME_ROW_GAP_REM,
  HOME_ROW_HEIGHT_REM,
  type HomeCardVisibility,
  type PlacementGeometry,
} from "@/utils/homeLayout";
import { normalizeShortcutRow, shortcutWidthRem } from "@/utils/shortcut";

export type ShortcutPlacement = PlacementGeometry & {
  id: string;
  shortcut: Shortcut;
};

type ShortcutSource = {
  readonly value: readonly Shortcut[];
};

type BooleanSource = {
  readonly value: boolean;
};

type UseHomeBoardOptions = {
  visibility: HomeCardVisibility;
  shortcuts: ShortcutSource;
  isEditing: BooleanSource;
};

export const HOME_BOARD_ROW_HEIGHT_REM = HOME_ROW_HEIGHT_REM;
export const HOME_BOARD_ROW_GAP_REM = HOME_ROW_GAP_REM;
export const HOME_BOARD_ROW_STEP_REM = HOME_ROW_HEIGHT_REM + HOME_ROW_GAP_REM;
export const HOME_BOARD_ROW_COUNT = HOME_ROW_COUNT;

export function useHomeBoard(options: UseHomeBoardOptions) {
  const homeLayout = computed(() => computeHomeLayout(options.visibility));
  const cardPlacements = computed(() => homeLayout.value.placements);

  const boardHeightRem =
    HOME_BOARD_ROW_COUNT * HOME_ROW_HEIGHT_REM +
    (HOME_BOARD_ROW_COUNT - 1) * HOME_ROW_GAP_REM;

  /**
   * 每行独立排列，行数固定、行内数量不限。
   * 快捷方式显式保存 row，横向位置由该行大卡与前面的卡片顺序推算。
   */
  const shortcutLayout = computed(() => {
    const rowCursors = [...homeLayout.value.rowStarts];
    const placements: ShortcutPlacement[] = [];
    let maxEndRem = 0;

    for (const shortcut of options.shortcuts.value) {
      const row = normalizeShortcutRow(shortcut.row);
      const width = shortcutWidthRem(shortcut.title, options.isEditing.value);
      const x = rowCursors[row] ?? 0;

      placements.push({
        id: shortcut.id,
        shortcut,
        widthRem: width,
        rows: 1,
        row,
        xRem: x,
      });
      rowCursors[row] = x + width + HOME_ROW_GAP_REM;
      maxEndRem = Math.max(maxEndRem, x + width);
    }

    return { placements, maxEndRem };
  });

  const shortcutPlacements = computed(() => shortcutLayout.value.placements);

  const boardWidthRem = computed(() =>
    Math.max(homeLayout.value.boardWidthRem, shortcutLayout.value.maxEndRem),
  );

  const boardStyle = computed<CSSProperties>(() => ({
    width: `${boardWidthRem.value}rem`,
    height: `${boardHeightRem}rem`,
  }));

  function placementStyle(item: PlacementGeometry | undefined): CSSProperties {
    if (!item) return {};

    return {
      left: `${item.xRem}rem`,
      top: `${item.row * HOME_BOARD_ROW_STEP_REM}rem`,
      width: `${item.widthRem}rem`,
      height: `${item.rows * HOME_ROW_HEIGHT_REM + (item.rows - 1) * HOME_ROW_GAP_REM}rem`,
    };
  }

  function rowTopRem(row: number): number {
    return row * HOME_BOARD_ROW_STEP_REM;
  }

  function availableStartRem(row: number): number {
    return homeLayout.value.rowStarts[row] ?? 0;
  }

  function rowGuideStyle(row: number): CSSProperties {
    const start = availableStartRem(row);
    return {
      left: `${start}rem`,
      top: `${rowTopRem(row)}rem`,
      width: `${Math.max(0, boardWidthRem.value - start)}rem`,
      height: `${HOME_ROW_HEIGHT_REM}rem`,
    };
  }

  return {
    homeLayout,
    cardPlacements,
    boardHeightRem,
    shortcutLayout,
    shortcutPlacements,
    boardWidthRem,
    boardStyle,
    placementStyle,
    rowTopRem,
    availableStartRem,
    rowGuideStyle,
  };
}

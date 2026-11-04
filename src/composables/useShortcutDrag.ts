/** 快捷方式拖拽：画布落点、行内插入序号与插入线。 */
import { computed, ref, type CSSProperties } from "vue";
import type { Shortcut } from "@/types";
import { HOME_ROW_HEIGHT_REM } from "@/domain/homeLayout";
import { resolveShortcutDrop } from "@/domain/shortcut";
import type { ShortcutPlacement } from "@/composables/useHomeBoard";

type BooleanSource = {
  readonly value: boolean;
};

type NumberSource = {
  readonly value: number;
};

type PlacementsSource = {
  readonly value: readonly ShortcutPlacement[];
};

type RowStartsSource = {
  readonly value: readonly number[];
};

type ElementSource = {
  value: HTMLElement | null;
};

type UseShortcutDragOptions = {
  boardElement: ElementSource;
  isEditing: BooleanSource;
  boardWidthRem: NumberSource;
  shortcutPlacements: PlacementsSource;
  rowStarts: RowStartsSource;
  rowCount: number;
  rowStepRem: number;
  rowGapRem: number;
  rowTopRem: (row: number) => number;
  moveShortcutTo: (id: string, row: number, index: number) => void;
};

export function useShortcutDrag(options: UseShortcutDragOptions) {
  const draggingId = ref<string | null>(null);
  const dragRow = ref<number | null>(null);
  const dragIndex = ref<number | null>(null);
  const dragInsertX = ref<number | null>(null);

  const insertionStyle = computed<CSSProperties>(() => {
    if (dragRow.value === null || dragInsertX.value === null) return {};
    return {
      left: `${Math.min(dragInsertX.value, options.boardWidthRem.value)}rem`,
      top: `${options.rowTopRem(dragRow.value)}rem`,
      height: `${HOME_ROW_HEIGHT_REM}rem`,
    };
  });

  function handleShortcutDragStart(shortcut: Shortcut): void {
    if (!options.isEditing.value) return;
    clearDragTarget();
    draggingId.value = shortcut.id;
  }

  /**
   * 在整块功能区上计算落点：纵向按固定行数取行号，横向按该行现有卡片取插入序号。
   * 空行、行尾空白和超出当前画布宽度的行尾都可作为放置目标。
   */
  function handleBoardDragOver(event: DragEvent): void {
    if (!options.isEditing.value || !draggingId.value) return;

    const board = options.boardElement.value;
    if (!board) return;

    const result = resolveShortcutDrop({
      pointerX: event.clientX,
      pointerY: event.clientY,
      rect: board.getBoundingClientRect(),
      boardWidthRem: options.boardWidthRem.value,
      rowCount: options.rowCount,
      rowStepRem: options.rowStepRem,
      rowGapRem: options.rowGapRem,
      rowStarts: options.rowStarts.value,
      placements: options.shortcutPlacements.value,
      draggingId: draggingId.value,
    });

    if (!result) {
      clearDragTarget();
      return;
    }

    dragRow.value = result.row;
    dragIndex.value = result.index;
    dragInsertX.value = result.insertX;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  }

  function handleBoardDrop(event: DragEvent): void {
    if (!options.isEditing.value || !draggingId.value) return;

    const row = dragRow.value;
    const index = dragIndex.value;
    if (row === null || index === null) return;

    event.preventDefault();
    options.moveShortcutTo(draggingId.value, row, index);
    resetDragState();
  }

  function handleShortcutDragEnd(): void {
    resetDragState();
  }

  function clearDragTarget(): void {
    dragRow.value = null;
    dragIndex.value = null;
    dragInsertX.value = null;
  }

  function resetDragState(): void {
    draggingId.value = null;
    clearDragTarget();
  }

  return {
    draggingId,
    dragRow,
    dragIndex,
    dragInsertX,
    insertionStyle,
    handleShortcutDragStart,
    handleBoardDragOver,
    handleBoardDrop,
    handleShortcutDragEnd,
    resetDragState,
  };
}

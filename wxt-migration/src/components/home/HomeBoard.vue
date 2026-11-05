<script setup lang="ts">
import type { CSSProperties } from "vue";

withDefaults(
  defineProps<{
    rowCount: number;
    isEditing: boolean;
    dragRow: number | null;
    rowGuideStyle: (row: number) => CSSProperties;
    insertionStyle?: CSSProperties;
    showInsertion?: boolean;
  }>(),
  {
    insertionStyle: () => ({}),
    showInsertion: false,
  },
);
</script>

<template>
  <template v-for="row in rowCount" :key="`row-guide-${row}`">
    <div
      v-if="isEditing"
      :data-row-guide="row - 1"
      class="pointer-events-none absolute rounded-xl border border-dashed transition-colors"
      :class="
        dragRow === row - 1
          ? 'border-sky-300/40 bg-sky-300/5'
          : 'border-white/10'
      "
      :style="rowGuideStyle(row - 1)"
    ></div>
  </template>

  <slot></slot>

  <div
    v-if="showInsertion"
    aria-hidden="true"
    class="pointer-events-none absolute z-20 w-0.5 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.75)]"
    :style="insertionStyle"
  ></div>
</template>

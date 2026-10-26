<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    hint?: string
  }>(),
  {
    hint: '',
  },
)
</script>

<template>
  <div
    class="flex min-h-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-center"
  >
    <span class="text-xs text-white/45">{{ label }}</span>
    <span v-if="hint" class="text-[10px] text-white/25">{{ hint }}</span>
  </div>
</template>

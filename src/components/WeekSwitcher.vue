<script setup lang="ts">
import type { Week } from '@/types'

withDefaults(
  defineProps<{
    selectedWeek: number
    currentWeek: number | null
    weeks: Week[]
    canPrev: boolean
    canNext: boolean
    label?: string
  }>(),
  {
    label: '周次切换',
  },
)

const emit = defineEmits<{
  select: [week: number]
}>()

function onSelectChange(event: Event): void {
  emit('select', Number((event.target as HTMLSelectElement).value))
}
</script>

<template>
  <nav class="flex items-center justify-between gap-4" :aria-label="label">
    <button
      type="button"
      class="rounded-full border border-white/20 bg-slate-950/40 px-4 py-2 text-sm text-white/75 backdrop-blur-xl transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      :disabled="!canPrev"
      @click="emit('select', selectedWeek - 1)"
    >
      上一周
    </button>

    <label class="flex items-center gap-2 text-sm text-white/55">
      <span>跳转</span>
      <select
        v-if="weeks.length > 0"
        :value="selectedWeek"
        class="rounded-full border border-white/20 bg-slate-950/70 px-3 py-2 text-sm text-white/80 outline-none transition focus:border-white/35"
        aria-label="选择教学周"
        @change="onSelectChange"
      >
        <option
          v-for="week in weeks"
          :key="week.serialNumber"
          :value="week.serialNumber"
        >
          第 {{ week.serialNumber }} 周{{ week.serialNumber === currentWeek ? '（当前）' : '' }}
        </option>
      </select>
      <span v-else class="text-white/45">第 {{ selectedWeek }} 周</span>
    </label>

    <button
      type="button"
      class="rounded-full border border-white/20 bg-slate-950/40 px-4 py-2 text-sm text-white/75 backdrop-blur-xl transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      :disabled="!canNext"
      @click="emit('select', selectedWeek + 1)"
    >
      下一周
    </button>
  </nav>
</template>

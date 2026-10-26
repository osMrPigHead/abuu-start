<script setup lang="ts">
import { computed } from 'vue'
import type { SpocAssignment } from '@/types'
import {
  formatSpocDateTime,
  formatSpocStart,
  spocCourseLine,
  spocSubmissionLabel,
} from '@/utils/spoc'

const props = defineProps<{
  assignment: SpocAssignment
}>()

const emit = defineEmits<{
  open: []
}>()

const courseLine = computed(() => spocCourseLine(props.assignment))
const statusLabel = computed(() => spocSubmissionLabel(props.assignment))
const startText = computed(() => formatSpocStart(props.assignment.startTime))
const dueText = computed(() => {
  const text = formatSpocDateTime(props.assignment.dueTime)
  return text.length > 0 ? text : '无截止时间'
})
</script>

<template>
  <button
    type="button"
    class="block w-full rounded-2xl border border-white/10 bg-slate-950/35 px-5 py-4 text-left shadow-[0_18px_50px_-32px_rgba(0,0,0,0.9)] backdrop-blur-md transition hover:border-white/20 hover:bg-slate-950/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
    @click="emit('open')"
  >
    <div class="flex items-start justify-between gap-3">
      <h2 class="min-w-0 flex-1 text-[15px] font-medium leading-snug text-white/90">
        {{ assignment.title }}
      </h2>
      <span
        class="shrink-0 rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10.5px] leading-tight text-white/50"
      >
        {{ statusLabel }}
      </span>
    </div>

    <p class="mt-1 min-w-0 truncate text-[11.5px] text-white/45">{{ courseLine }}</p>
    <p class="mt-0.5 text-[11.5px] text-white/45">开始 {{ startText }}</p>
    <p class="mt-1 text-[11.5px] font-medium text-white/70">
      {{ dueText === '无截止时间' ? dueText : `截止 ${dueText}` }}
    </p>
  </button>
</template>
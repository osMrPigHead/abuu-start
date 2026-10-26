<script setup lang="ts">
import { computed } from 'vue'
import type { Exam } from '@/types'
import {
  formatExamCountdown,
  formatExamPlace,
  formatExamSeat,
  formatExamTimeText,
  formatExamWeek,
  isExamEnded,
} from '@/utils/exams'

const props = withDefaults(
  defineProps<{
    exam: Exam
    now: Date
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const timeText = computed(() => formatExamTimeText(props.exam))
const placeText = computed(() => formatExamPlace(props.exam))
const seatText = computed(() => formatExamSeat(props.exam))
const weekText = computed(() => formatExamWeek(props.exam))
const countdownText = computed(() => formatExamCountdown(props.exam, props.now))
const ended = computed(() => isExamEnded(props.exam, props.now))
</script>

<template>
  <article
    v-if="compact"
    class="flex min-w-0 flex-col rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5"
    :class="ended ? 'opacity-55' : ''"
    :title="`${exam.courseName} · ${timeText} · ${placeText}`"
  >
    <div class="flex min-w-0 items-baseline justify-between gap-1">
      <p class="min-w-0 truncate text-[12.5px] font-semibold leading-tight text-white">
        {{ exam.courseName }}
      </p>
      <span
        class="shrink-0 text-[9.5px] font-semibold leading-tight"
        :class="ended ? 'text-white/40' : 'text-white/80'"
      >
        {{ countdownText }}
      </span>
    </div>
    <p class="mt-0.5 min-w-0 truncate text-[9.5px] leading-tight text-white/55">
      {{ timeText }}
    </p>
    <p class="mt-0.5 min-w-0 truncate text-[9.5px] leading-tight text-white/55">
      {{ placeText }}
    </p>
  </article>

  <article
    v-else
    class="flex flex-col rounded-2xl border border-white/15 bg-slate-950/45 px-5 py-4 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md transition-colors"
    :class="ended ? 'opacity-60' : ''"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <h3 class="min-w-0 text-[15px] font-semibold leading-snug text-white">
        {{ exam.courseName }}
      </h3>
      <span
        class="shrink-0 text-[12px] font-semibold"
        :class="ended ? 'text-white/40' : 'text-white/85'"
      >
        {{ countdownText }}
      </span>
    </div>

    <div class="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12px] text-white/55">
      <span>{{ timeText }}</span>
      <span>{{ placeText }}</span>
      <span>{{ seatText }}</span>
      <span>{{ weekText }}</span>
    </div>
  </article>
</template>

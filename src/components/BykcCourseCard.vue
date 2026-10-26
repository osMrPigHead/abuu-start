<script setup lang="ts">
import { computed } from 'vue'
import type { BykcCourse } from '@/types'
import {
  bykcMetaLine,
  bykcStatusLabel,
  formatBykcCardTime,
  formatBykcListTime,
} from '@/utils/bykc'

const props = withDefaults(
  defineProps<{
    course: BykcCourse
    /** 主页卡片使用 compact；广场列表使用完整卡片。 */
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const emit = defineEmits<{
  open: []
}>()

const statusLabel = computed(() => bykcStatusLabel(props.course.status))
const cardTime = computed(() => formatBykcCardTime(props.course.startTime))
const listTime = computed(() => formatBykcListTime(props.course.startTime, props.course.endTime))
const metaLine = computed(() => bykcMetaLine(props.course))
const placeVisible = computed(() => (props.course.place?.trim().length ?? 0) > 0)
const accessibleLabel = computed(() => `打开课程详情：${props.course.courseName}`)
</script>

<template>
  <button
    v-if="compact"
    type="button"
    class="flex min-h-0 flex-1 flex-col justify-center rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-left transition hover:border-white/20 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
    :title="`${course.courseName} · ${listTime}`"
    :aria-label="accessibleLabel"
    @click="emit('open')"
  >
    <p class="min-w-0 truncate text-[12.5px] font-semibold leading-tight text-white/90">
      {{ course.courseName }}
    </p>
    <p class="mt-0.5 min-w-0 truncate text-[9.5px] leading-tight text-white/55">
      {{ cardTime }}
    </p>
    <p
      v-if="placeVisible"
      class="mt-0.5 min-w-0 truncate text-[9.5px] leading-tight text-white/45"
    >
      {{ course.place }}
    </p>
  </button>

  <button
    v-else
    type="button"
    class="block w-full rounded-2xl border border-white/10 bg-slate-950/35 px-5 py-4 text-left shadow-[0_18px_50px_-32px_rgba(0,0,0,0.9)] backdrop-blur-md transition hover:border-white/20 hover:bg-slate-950/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
    :aria-label="accessibleLabel"
    @click="emit('open')"
  >
    <div class="flex items-start justify-between gap-3">
      <h2 class="min-w-0 flex-1 text-[15px] font-medium leading-snug text-white/90">
        {{ course.courseName }}
      </h2>
      <span
        class="shrink-0 rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10.5px] leading-tight text-white/50"
      >
        {{ statusLabel }}
      </span>
    </div>

    <p class="mt-1 min-w-0 truncate text-[11.5px] text-white/45">{{ listTime }}</p>
    <p class="mt-1 min-w-0 truncate text-[11.5px] text-white/45">{{ metaLine }}</p>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Course, SectionTime } from '@/types'
import {
  coursePlaceText,
  courseSectionLabel,
  courseTimeLabel,
  type CourseHighlight,
} from '@/utils/schedule'

const props = withDefaults(
  defineProps<{
    course: Course
    sectionTimes: SectionTime[]
    compact?: boolean
    highlight?: CourseHighlight
  }>(),
  {
    compact: false,
    highlight: null,
  },
)

const sectionLabel = computed(() => courseSectionLabel(props.course))
const timeLabel = computed(() => courseTimeLabel(props.course, props.sectionTimes))
const placeLabel = computed(() => coursePlaceText(props.course))
const isBykc = computed(() => props.course.source === 'bykc')
const displayName = computed(() =>
  isBykc.value ? `博雅 · ${props.course.courseName}` : props.course.courseName,
)

const highlightClass = computed(() => {
  if (props.highlight === 'ongoing') {
    return 'border-white/15 course-highlight-ongoing'
  }
  if (props.highlight === 'upcoming') {
    return 'border-white/15 course-highlight-upcoming'
  }
  return 'border-white/10 border-l-sky-300/35 bg-white/[0.045]'
})

const ariaLabel = computed(() => {
  if (props.highlight === 'ongoing') return `进行中：${displayName.value}`
  if (props.highlight === 'upcoming') return `即将开始：${displayName.value}`
  return displayName.value
})
</script>

<template>
  <article
    class="flex shrink-0 flex-col justify-center rounded-xl border border-l-2 text-white/90 transition-colors"
    :class="[highlightClass, compact ? 'w-[10.25rem] px-2 py-1' : 'w-[12.5rem] px-3 py-2.5']"
    :data-highlight="highlight ?? 'none'"
    :aria-label="ariaLabel"
  >
    <div class="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
      <span
        v-if="isBykc"
        class="font-medium text-white/80"
        :class="compact ? 'text-[10px] leading-tight' : 'text-[12px]'"
      >
        博雅
      </span>
      <span
        v-else-if="sectionLabel"
        class="font-medium text-white/80"
        :class="compact ? 'text-[10px] leading-tight' : 'text-[12px]'"
      >
        {{ sectionLabel }}
      </span>
      <span
        v-if="timeLabel"
        class="text-white/50"
        :class="compact ? 'text-[9.5px] leading-tight' : 'text-[11px]'"
      >
        {{ timeLabel }}
      </span>
      <span
        v-if="!isBykc && !sectionLabel && !timeLabel"
        class="text-white/40"
        :class="compact ? 'text-[9.5px] leading-tight' : 'text-[11px]'"
      >
        时间待定
      </span>
    </div>

    <p
      class="mt-0.5 min-w-0 font-semibold leading-tight text-white"
      :class="compact ? 'truncate text-[12.5px]' : 'text-[15px] leading-snug'"
      :title="course.courseName"
    >
      {{ course.courseName }}
    </p>

    <p
      class="mt-0.5 min-w-0 text-white/55"
      :class="compact ? 'truncate text-[9.5px] leading-tight' : 'text-[11px] leading-snug'"
      :title="placeLabel"
    >
      {{ placeLabel || '地点待定' }}
    </p>
  </article>
</template>

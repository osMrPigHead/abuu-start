<script setup lang="ts">
import { computed } from 'vue'
import CourseBlock from '@/components/CourseBlock.vue'
import { useHorizontalWheelScroll } from '@/composables/useHorizontalWheelScroll'
import type { Course, SectionTime } from '@/types'
import { formatDayNumber, weekdayCn } from '@/utils/date'
import {
  courseHighlightState,
  DEFAULT_HIGHLIGHT_LEAD_MINUTES,
  type CourseHighlight,
} from '@/utils/schedule'

const props = withDefaults(
  defineProps<{
    date: Date
    weekNumber: number | null
    relativeLabel?: string | null
    courses: Course[]
    sectionTimes: SectionTime[]
    state: 'loading' | 'ready' | 'unavailable'
    compact?: boolean
    now?: Date | null
    highlightLeadMinutes?: number
  }>(),
  {
    relativeLabel: null,
    compact: false,
    now: null,
    highlightLeadMinutes: DEFAULT_HIGHLIGHT_LEAD_MINUTES,
  },
)

const dateLabel = computed(() => formatDayNumber(props.date))
const weekdayLabel = computed(() => weekdayCn(props.date))

const { setScrollElement: setStripElement, onWheel: handleStripWheel } =
  useHorizontalWheelScroll({ consume: true })

function highlightFor(course: Course): CourseHighlight {
  if (!props.now) return null
  return courseHighlightState(
    course,
    props.sectionTimes,
    props.date,
    props.now,
    props.highlightLeadMinutes,
  )
}
</script>

<template>
  <div
    class="flex min-h-0 items-stretch"
    :class="compact ? 'gap-2 py-0.5' : 'gap-4 py-3'"
    @wheel="handleStripWheel"
  >
    <div
      class="flex shrink-0 flex-col justify-center"
      :class="compact ? 'w-[3.8rem]' : 'w-[7rem]'"
    >
      <span
        class="font-semibold leading-none text-white/90"
        :class="compact ? 'text-[21px]' : 'text-[30px]'"
      >
        {{ dateLabel }}
      </span>
      <div
        class="mt-1 flex flex-wrap items-baseline gap-x-1.5 whitespace-nowrap text-white/55"
        :class="compact ? 'text-[10px]' : 'text-[12px]'"
      >
        <span>{{ weekdayLabel }}</span>
        <span v-if="relativeLabel">{{ relativeLabel }}</span>
      </div>
      <div
        v-if="weekNumber !== null"
        class="mt-0.5 whitespace-nowrap text-white/35"
        :class="compact ? 'text-[9px]' : 'text-[11px]'"
      >
        第 {{ weekNumber }} 周
      </div>
    </div>

    <div
      :ref="setStripElement"
      class="schedule-strip flex min-w-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden"
      :class="compact ? 'items-center' : 'items-stretch'"
    >
      <template v-if="courses.length > 0">
        <CourseBlock
          v-for="(course, index) in courses"
          :key="`${course.courseCode}-${course.courseName}-${course.dayOfWeek}-${course.beginSection}-${index}`"
          :course="course"
          :section-times="sectionTimes"
          :compact="compact"
          :highlight="highlightFor(course)"
        />
      </template>
      <p
        v-else-if="state === 'ready'"
        class="self-center whitespace-nowrap text-white/40"
        :class="compact ? 'text-[11px]' : 'text-[13px]'"
      >
        无课
      </p>
      <p
        v-else-if="state === 'loading'"
        class="self-center whitespace-nowrap text-white/40"
        :class="compact ? 'text-[11px]' : 'text-[13px]'"
      >
        加载中…
      </p>
      <p
        v-else
        class="self-center whitespace-nowrap text-white/35"
        :class="compact ? 'text-[11px]' : 'text-[13px]'"
      >
        暂无可显示的课表数据
      </p>
    </div>
  </div>
</template>

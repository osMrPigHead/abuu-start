<script setup lang="ts">
import { computed } from "vue";
import CardStatusActions from "@/components/CardStatusActions.vue";
import ExamCard from "@/components/ExamCard.vue";
import HomeCard from "@/components/HomeCard.vue";
import ScheduleDayRow from "@/components/ScheduleDayRow.vue";
import type { SectionTime } from "@shared/api";
import type { Course, SourceStatus } from "@/types";
import type { ExamEntry } from "@/utils/exams";

const props = defineProps<{
  badge: string;
  canRetry: boolean;
  needsSettings: boolean;
  nextLine: string;
  nextPromptState: "upcoming" | "ongoing" | null;
  todayDate: Date;
  todayWeekNumber: number | null;
  todayCourses: Course[];
  todaySectionTimes: SectionTime[];
  todayState: "loading" | "ready" | "unavailable";
  tomorrowDate: Date;
  tomorrowWeekNumber: number | null;
  tomorrowCourses: Course[];
  tomorrowSectionTimes: SectionTime[];
  tomorrowState: "loading" | "ready" | "unavailable";
  now: Date;
  highlightLeadMinutes: number;
  recentExams: ExamEntry[];
  examStatus: SourceStatus;
  examError: string | null;
  examEmptyText: string;
  warning: string | null;
}>();

const emit = defineEmits<{
  openSchedule: [];
  openExams: [];
  retry: [];
  refreshExams: [];
}>();

const nextLineClass = computed(() => {
  if (props.nextPromptState === "ongoing") return "font-medium text-sky-200";
  if (props.nextPromptState === "upcoming") return "font-medium text-amber-200";
  return "text-white/55";
});
</script>

<template>
  <HomeCard
    title="日程"
    :badge="badge"
    dense
    class="h-full w-full cursor-pointer"
    role="link"
    tabindex="0"
    aria-label="打开日程详情"
    @click="emit('openSchedule')"
    @keydown.enter="emit('openSchedule')"
    @keydown.space.prevent="emit('openSchedule')"
  >
    <template #actions>
      <CardStatusActions
        :retryable="canRetry"
        :needs-settings="needsSettings"
        @retry="emit('retry')"
      />
    </template>

    <div class="flex min-h-0 flex-1 flex-col gap-1">
      <p
        class="shrink-0 truncate text-[11px] leading-tight transition-colors"
        :class="nextLineClass"
      >
        {{ nextLine }}
      </p>

      <div class="flex min-h-0 flex-1 flex-col gap-1">
        <ScheduleDayRow
          :date="todayDate"
          :week-number="todayWeekNumber"
          relative-label="今天"
          :courses="todayCourses"
          :section-times="todaySectionTimes"
          :state="todayState"
          :now="now"
          :highlight-lead-minutes="highlightLeadMinutes"
          compact
          class="min-h-0 flex-1"
        />
        <ScheduleDayRow
          :date="tomorrowDate"
          :week-number="tomorrowWeekNumber"
          relative-label="明天"
          :courses="tomorrowCourses"
          :section-times="tomorrowSectionTimes"
          :state="tomorrowState"
          :now="now"
          :highlight-lead-minutes="highlightLeadMinutes"
          compact
          class="min-h-0 flex-1"
        />
      </div>

      <div
        class="min-w-0 cursor-pointer"
        role="link"
        tabindex="0"
        aria-label="打开考试详情"
        @click.stop="emit('openExams')"
        @keydown.enter.stop="emit('openExams')"
        @keydown.space.stop.prevent="emit('openExams')"
      >
        <div
          v-if="recentExams.length > 0"
          class="grid min-w-0 auto-cols-fr grid-flow-col gap-2"
        >
          <ExamCard
            v-for="entry in recentExams"
            :key="`${entry.exam.courseName}-${entry.exam.examDate}-${entry.exam.startTime}`"
            :exam="entry.exam"
            :now="now"
            compact
          />
        </div>

        <div
          v-else
          class="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2 py-1.5 text-[9.5px] leading-tight text-white/45 transition hover:border-white/25"
        >
          <span class="min-w-0 truncate">{{ examEmptyText }}</span>
          <button
            v-if="examStatus === 'error'"
            type="button"
            class="shrink-0 text-white/65 transition hover:text-white"
            @click.stop="emit('refreshExams')"
          >
            重试
          </button>
        </div>
      </div>

      <p
        v-if="warning"
        class="shrink-0 truncate text-[9px] leading-tight text-amber-200/65"
        :title="warning"
      >
        {{ warning }}
      </p>
    </div>
  </HomeCard>
</template>

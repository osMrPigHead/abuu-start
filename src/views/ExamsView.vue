<script setup lang="ts">
import { computed, onMounted } from "vue";
import ExamCard from "@/components/exams/ExamCard.vue";
import PageHeader from "@/components/common/PageHeader.vue";
import SourceStatePanel from "@/components/common/SourceStatePanel.vue";
import { useClock } from "@/composables/useClock";
import { useExams } from "@/composables/useExams";
import {
  shouldShowSourceEmpty,
  type SourcePageLabels,
} from "@/domain/sourceStatus";
import { groupExams } from "@/domain/exams";

const { state, refresh } = useExams();
const { now } = useClock(30_000);

const groups = computed(() => groupExams(state.exams, now.value));
const hasUpcoming = computed(() => groups.value.upcoming.length > 0);
const hasEnded = computed(() => groups.value.ended.length > 0);
const isEmpty = computed(() => state.exams.length === 0);

const showEmptyUpcoming = computed(() =>
  shouldShowSourceEmpty({
    status: state.status,
    loading: state.loading,
    hasContent: hasUpcoming.value,
    dataEmpty: isEmpty.value,
  }),
);

const labels: SourcePageLabels = {
  statusNoCredential: "未登录，请前往设置完成登录",
  statusAuthExpired: "登录状态已失效，请重新登录",
  statusFallback: "考试加载失败",
  noticeLoading: "正在加载考试安排…",
  noticeNoCredential: "登录后查看考试安排。",
  noticeError: "考试加载失败",
};

onMounted(() => {
  void refresh();
});

function retry(): void {
  void refresh();
}
</script>

<template>
  <div class="home-backdrop min-h-screen text-white antialiased">
    <main class="mx-auto w-full max-w-4xl px-8 py-10">
      <PageHeader
        title="考试"
        :subtitle="state.term?.name || '本学期已排定考试'"
      />

      <div class="route-page-body flow-root">
        <SourceStatePanel
          :status="state.status"
          :saved-at="state.savedAt"
          :error="state.error"
          :loading="state.loading"
          :data-empty="isEmpty"
          :labels="labels"
          @retry="retry"
        />

        <section v-if="hasUpcoming" class="mt-6" aria-label="未开始考试">
          <div
            v-for="group in groups.upcoming"
            :key="group.key"
            class="mt-5 first:mt-0"
          >
            <h2 class="text-sm font-medium tracking-wide text-white/55">
              {{ group.label }}
            </h2>
            <div class="mt-2 flex flex-col gap-2">
              <ExamCard
                v-for="entry in group.entries"
                :key="`${entry.exam.courseName}-${entry.exam.examDate}-${entry.exam.startTime}-${entry.exam.examPlace}`"
                :exam="entry.exam"
                :now="now"
              />
            </div>
          </div>
        </section>

        <div
          v-if="showEmptyUpcoming"
          class="mt-5 rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center text-sm text-white/45"
        >
          {{ isEmpty ? "暂无考试安排" : "暂无未开始考试" }}
        </div>

        <section v-if="hasEnded" class="mt-7" aria-label="已结束考试">
          <div v-for="group in groups.ended" :key="group.key">
            <h2 class="text-sm font-medium tracking-wide text-white/45">
              {{ group.label }}
            </h2>
            <div class="mt-2 flex flex-col gap-2">
              <ExamCard
                v-for="entry in group.entries"
                :key="`ended-${entry.exam.courseName}-${entry.exam.examDate}-${entry.exam.startTime}`"
                :exam="entry.exam"
                :now="now"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

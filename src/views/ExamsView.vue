<script setup lang="ts">
import { computed, onMounted } from "vue";
import ExamCard from "@/components/ExamCard.vue";
import PageHeader from "@/components/PageHeader.vue";
import PageStateNotice from "@/components/PageStateNotice.vue";
import SourceStatusLine from "@/components/SourceStatusLine.vue";
import { useClock } from "@/composables/useClock";
import { useExams } from "@/composables/useExams";
import { groupExams } from "@/utils/exams";

const { state, hydrate, refresh } = useExams();
const { now } = useClock(30_000);

hydrate();

const groups = computed(() => groupExams(state.exams, now.value));
const hasUpcoming = computed(() => groups.value.upcoming.length > 0);
const hasEnded = computed(() => groups.value.ended.length > 0);
const isEmpty = computed(() => state.exams.length === 0);

const showEmptyUpcoming = computed(
  () =>
    !state.loading &&
    !hasUpcoming.value &&
    !(
      isEmpty.value &&
      (state.status === "loading" ||
        state.status === "no-credential" ||
        state.status === "auth-expired" ||
        state.status === "error")
    ),
);

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
        <div
          class="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 backdrop-blur-md"
        >
          <SourceStatusLine
            :status="state.status"
            :saved-at="state.savedAt"
            :error="state.error"
            :refreshing="state.loading"
            @retry="retry"
          />
        </div>

        <PageStateNotice
          v-if="state.status === 'loading' && isEmpty"
          kind="loading"
          message="正在加载考试安排…"
        />

        <PageStateNotice
          v-else-if="state.status === 'no-credential' && isEmpty"
          kind="no-credential"
          message="登录后查看考试安排。"
          settings-link
        />

        <PageStateNotice
          v-else-if="state.status === 'error' && isEmpty"
          kind="error"
          :message="state.error || '考试加载失败'"
          retryable
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

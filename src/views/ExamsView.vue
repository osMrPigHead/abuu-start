<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import ExamCard from '@/components/ExamCard.vue'
import SourceStatusLine from '@/components/SourceStatusLine.vue'
import { useClock } from '@/composables/useClock'
import { useExams } from '@/composables/useExams'
import { groupExams } from '@/utils/exams'

const { state, hydrate, refresh } = useExams()
const { now } = useClock(30_000)

hydrate()

const groups = computed(() => groupExams(state.exams, now.value))
const hasUpcoming = computed(() => groups.value.upcoming.length > 0)
const hasEnded = computed(() => groups.value.ended.length > 0)
const isEmpty = computed(() => state.exams.length === 0)

const showEmptyUpcoming = computed(
  () =>
    !state.loading &&
    !hasUpcoming.value &&
    !(
      isEmpty.value &&
      (state.status === 'loading' ||
        state.status === 'no-credential' ||
        state.status === 'auth-expired' ||
        state.status === 'error')
    ),
)

onMounted(() => {
  void refresh()
})

function retry(): void {
  void refresh()
}
</script>

<template>
  <div class="home-backdrop min-h-screen text-white antialiased">
    <main class="mx-auto w-full max-w-4xl px-8 py-10">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-wide">考试</h1>
          <p class="mt-1 text-sm text-white/45">
            {{ state.term?.name || '本学期已排定考试' }}
          </p>
        </div>
      </header>

      <div class="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 backdrop-blur-md">
        <SourceStatusLine
          :status="state.status"
          :saved-at="state.savedAt"
          :error="state.error"
          :refreshing="state.loading"
          @retry="retry"
        />
      </div>

      <div
        v-if="state.status === 'loading' && isEmpty"
        class="mt-5 rounded-2xl border border-dashed border-white/12 px-5 py-10 text-center text-sm text-white/45"
      >
        正在加载考试安排…
      </div>

      <div
        v-else-if="state.status === 'no-credential' && isEmpty"
        class="mt-5 rounded-2xl border border-dashed border-white/12 px-5 py-10 text-center"
      >
        <p class="text-sm text-white/60">配置本研教育管理系统 Cookie 后查看考试安排。</p>
        <RouterLink
          to="/settings"
          class="mt-3 inline-flex rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:text-white"
        >
          前往设置
        </RouterLink>
      </div>

      <div
        v-else-if="state.status === 'error' && isEmpty"
        class="mt-5 rounded-2xl border border-dashed border-amber-200/20 px-5 py-10 text-center"
      >
        <p class="text-sm text-amber-100/75">{{ state.error || '考试加载失败' }}</p>
        <button
          type="button"
          class="mt-3 inline-flex rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:text-white"
          @click="retry"
        >
          重试
        </button>
      </div>

      <section v-if="hasUpcoming" class="mt-6" aria-label="未开始考试">
        <div v-for="group in groups.upcoming" :key="group.key" class="mt-5 first:mt-0">
          <h2 class="text-sm font-medium tracking-wide text-white/55">{{ group.label }}</h2>
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
        {{ isEmpty ? '暂无考试安排' : '暂无未开始考试' }}
      </div>

      <section v-if="hasEnded" class="mt-7" aria-label="已结束考试">
        <div v-for="group in groups.ended" :key="group.key">
          <h2 class="text-sm font-medium tracking-wide text-white/45">{{ group.label }}</h2>
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
    </main>
  </div>
</template>

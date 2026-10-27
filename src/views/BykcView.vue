<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BackHomeLink from '@/components/BackHomeLink.vue'
import BykcCourseCard from '@/components/BykcCourseCard.vue'
import BykcCourseModal from '@/components/BykcCourseModal.vue'
import SourceStatusLine from '@/components/SourceStatusLine.vue'
import { useBykc, useBykcDetail } from '@/composables/useBykc'
import type { BykcCourse } from '@/types'

const route = useRoute()
const router = useRouter()

const { state, loadPage, refresh } = useBykc()
const {
  state: detailState,
  open: openDetail,
  refresh: refreshDetail,
  close: closeDetail,
} = useBykcDetail()

const hasCourses = computed(() => state.courses.length > 0)
const isEmpty = computed(() => state.courses.length === 0)
const hasPrev = computed(() => state.page > 1)
const hasNext = computed(() => state.totalPages > 0 && state.page < state.totalPages)

const pageSummary = computed(() => {
  if (state.totalPages <= 0) return '浏览本学期博雅课程'
  return `共 ${state.total} 门 · 第 ${state.page} / ${state.totalPages} 页`
})

const showEmpty = computed(
  () =>
    !state.loading &&
    isEmpty.value &&
    (state.status === 'ok' || state.status === 'cached'),
)

onMounted(() => {
  void requestPage(readPageQuery() ?? 1)
})

watch(
  () => route.query.page,
  () => {
    const target = readPageQuery() ?? 1
    if (target === state.page) return
    void requestPage(target)
  },
)

/** 页码来自 `?page=n`；非法值回退第 1 页，越界回退末页，见 docs/trd-phase2.md 7.3。 */
function readPageQuery(): number | null {
  const raw = route.query.page
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
}

function replacePage(page: number): void {
  const query = { ...route.query }

  if (page <= 1) delete query.page
  else query.page = String(page)

  void router.replace({ query })
}

async function requestPage(target: number): Promise<void> {
  const invalidQuery = route.query.page !== undefined && readPageQuery() === null

  await loadPage(target)

  if (state.totalPages > 0 && state.page > state.totalPages) {
    const last = Math.max(1, state.totalPages)
    await loadPage(last)
    replacePage(last)
    return
  }

  if (invalidQuery || (readPageQuery() ?? 1) !== state.page) replacePage(state.page)
}

function goPage(page: number): void {
  if (page < 1 || page === state.page) return
  if (state.totalPages > 0 && page > state.totalPages) return

  replacePage(page)
}

function handleOpen(course: BykcCourse): void {
  openDetail(course)
}
</script>

<template>
  <div class="home-backdrop min-h-screen text-white antialiased">
    <main class="mx-auto w-full max-w-5xl px-8 py-10">
      <header class="route-page-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-wide">博雅课程广场</h1>
          <p class="mt-1 text-sm text-white/45">{{ pageSummary }}</p>
        </div>
        <BackHomeLink />
      </header>

      <div class="route-page-body flow-root">
        <div class="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 backdrop-blur-md">
          <SourceStatusLine
            :status="state.status"
            :saved-at="state.savedAt"
            :error="state.error"
            :refreshing="state.loading"
            no-credential-text="未登录，请前往设置完成登录"
            auth-expired-text="博雅登录状态已失效"
            fallback-error-text="博雅课程广场加载失败"
            @retry="refresh"
          />
        </div>

        <div
          v-if="state.status === 'loading' && isEmpty"
          class="mt-5 rounded-2xl border border-dashed border-white/12 px-5 py-10 text-center text-sm text-white/45"
        >
          正在加载课程广场…
        </div>

        <div
          v-else-if="state.status === 'no-credential' && isEmpty"
          class="mt-5 rounded-2xl border border-dashed border-white/12 px-5 py-10 text-center"
        >
          <p class="text-sm text-white/60">登录后浏览课程广场。</p>
          <RouterLink
            to="/settings"
            class="mt-3 inline-flex rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:text-white"
          >
            前往设置
          </RouterLink>
        </div>

        <div
          v-else-if="state.status === 'auth-expired' && isEmpty"
          class="mt-5 rounded-2xl border border-dashed border-amber-200/20 px-5 py-10 text-center"
        >
          <p class="text-sm text-amber-100/75">登录状态已失效，请到设置页重新登录。</p>
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
          <p class="text-sm text-amber-100/75">{{ state.error || '博雅课程广场加载失败' }}</p>
          <button
            type="button"
            class="mt-3 inline-flex rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:text-white"
            @click="refresh"
          >
            重试
          </button>
        </div>

        <section v-if="hasCourses" class="mt-5 flex flex-col gap-2" aria-label="博雅课程广场课程列表">
          <BykcCourseCard
            v-for="course in state.courses"
            :key="course.id"
            :course="course"
            @open="handleOpen(course)"
          />
        </section>

        <div
          v-if="showEmpty"
          class="mt-5 rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center text-sm text-white/45"
        >
          暂无课程
        </div>

        <nav
          v-if="hasCourses && state.totalPages > 0"
          class="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-white/55"
          aria-label="课程广场分页"
        >
          <button
            type="button"
            class="rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/75 transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            :disabled="!hasPrev"
            @click="goPage(state.page - 1)"
          >
            上一页
          </button>

          <span class="min-w-24 text-center text-xs text-white/45">
            第 {{ state.page }} / {{ state.totalPages }} 页
          </span>

          <button
            type="button"
            class="rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/75 transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            :disabled="!hasNext"
            @click="goPage(state.page + 1)"
          >
            下一页
          </button>
        </nav>
      </div>
    </main>

    <BykcCourseModal
      :open="detailState.courseId !== null"
      :preview="detailState.preview"
      :detail="detailState.course"
      :status="detailState.status"
      :saved-at="detailState.savedAt"
      :error="detailState.error"
      :loading="detailState.loading"
      :not-found="detailState.notFound"
      @close="closeDetail"
      @retry="refreshDetail"
    />
  </div>
</template>

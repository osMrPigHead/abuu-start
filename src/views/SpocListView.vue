<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BackHomeLink from '@/components/BackHomeLink.vue'
import SourceStatusLine from '@/components/SourceStatusLine.vue'
import SpocAssignmentCard from '@/components/SpocAssignmentCard.vue'
import SpocDetailDialog from '@/components/SpocDetailDialog.vue'
import { useClock } from '@/composables/useClock'
import { useSpoc, useSpocDetail } from '@/composables/useSpoc'
import type { SpocAssignment } from '@/types'
import { filterOpenSpocAssignments } from '@/utils/spoc'

const { state, hydrate, refresh } = useSpoc()
const {
  state: detailState,
  open: openDetail,
  openById: openDetailById,
  refresh: refreshDetail,
  close: closeDetail,
} = useSpocDetail()

onBeforeUnmount(closeDetail)

const route = useRoute()
const router = useRouter()
const { now } = useClock(30_000)

hydrate()

const assignments = computed(() => filterOpenSpocAssignments(state.assignments, now.value))
const hasAssignments = computed(() => assignments.value.length > 0)
const isEmpty = computed(() => state.assignments.length === 0)

const routeAssignmentId = computed(() => {
  const value = route.params.assignmentId
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
})

const showEmpty = computed(
  () =>
    !state.loading &&
    !hasAssignments.value &&
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
  if (routeAssignmentId.value.length > 0) openDetailById(routeAssignmentId.value)
})

watch(routeAssignmentId, (assignmentId) => {
  if (assignmentId.length > 0) openDetailById(assignmentId)
  else closeDetail()
})

function openAssignment(assignment: SpocAssignment): void {
  openDetail(assignment)
}

function closeDetailModal(): void {
  closeDetail()
  if (routeAssignmentId.value.length > 0) void router.replace('/spoc')
}

function retry(): void {
  void refresh()
}

function retryDetail(): void {
  void refreshDetail()
}
</script>

<template>
  <div class="home-backdrop min-h-screen text-white antialiased">
    <main class="mx-auto w-full max-w-4xl px-8 py-10">
      <header class="route-page-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-wide">SPOC 作业</h1>
          <p class="mt-1 text-sm text-white/45">
            {{ state.term?.name || '未提交且未截止的作业' }}
          </p>
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
            auth-expired-text="SPOC 登录状态已失效"
            fallback-error-text="SPOC 作业加载失败"
            @retry="retry"
          />
        </div>

        <div
          v-if="state.status === 'loading' && isEmpty"
          class="mt-5 rounded-2xl border border-dashed border-white/12 px-5 py-10 text-center text-sm text-white/45"
        >
          正在加载 SPOC 作业…
        </div>

        <div
          v-else-if="state.status === 'no-credential' && isEmpty"
          class="mt-5 rounded-2xl border border-dashed border-white/12 px-5 py-10 text-center"
        >
          <p class="text-sm text-white/60">登录后查看作业。</p>
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
          <p class="text-sm text-amber-100/75">{{ state.error || 'SPOC 作业加载失败' }}</p>
          <button
            type="button"
            class="mt-3 inline-flex rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:text-white"
            @click="retry"
          >
            重试
          </button>
        </div>

        <section v-if="hasAssignments" class="mt-5 flex flex-col gap-2" aria-label="未提交且未截止的 SPOC 作业">
          <SpocAssignmentCard
            v-for="assignment in assignments"
            :key="assignment.assignmentId"
            :assignment="assignment"
            @open="openAssignment(assignment)"
          />
        </section>

        <div
          v-if="showEmpty"
          class="mt-5 rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center text-sm text-white/45"
        >
          {{ isEmpty ? '暂无 SPOC 作业' : '暂无未完成作业' }}
        </div>
      </div>
    </main>

    <SpocDetailDialog
      :open="detailState.assignmentId !== null"
      :preview="detailState.preview"
      :detail="detailState.assignment"
      :status="detailState.status"
      :saved-at="detailState.savedAt"
      :error="detailState.error"
      :loading="detailState.loading"
      :not-found="detailState.notFound"
      @close="closeDetailModal"
      @retry="retryDetail"
    />
  </div>
</template>
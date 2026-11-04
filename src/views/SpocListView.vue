<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import SourceStatePanel from "@/components/common/SourceStatePanel.vue";
import SpocAssignmentCard from "@/components/spoc/SpocAssignmentCard.vue";
import SpocDetailDialog from "@/components/spoc/SpocDetailDialog.vue";
import { useClock } from "@/composables/useClock";
import { useSpoc, useSpocDetail } from "@/composables/useSpoc";
import type { SpocAssignment } from "@shared/api";
import { filterOpenSpocAssignments } from "@/domain/spoc";
import {
  shouldShowSourceEmpty,
  type SourcePageLabels,
} from "@/domain/sourceStatus";

const { state, refresh } = useSpoc();
const {
  state: detailState,
  open: openDetail,
  openById: openDetailById,
  refresh: refreshDetail,
  close: closeDetail,
} = useSpocDetail();

onBeforeUnmount(closeDetail);

const route = useRoute();
const router = useRouter();
const { now } = useClock(30_000);

const assignments = computed(() =>
  filterOpenSpocAssignments(state.assignments, now.value),
);
const hasAssignments = computed(() => assignments.value.length > 0);
const isEmpty = computed(() => state.assignments.length === 0);

const routeAssignmentId = computed(() => {
  const value = route.params.assignmentId;
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
});

const showEmpty = computed(() =>
  shouldShowSourceEmpty({
    status: state.status,
    loading: state.loading,
    hasContent: hasAssignments.value,
    dataEmpty: isEmpty.value,
  }),
);

const labels: SourcePageLabels = {
  statusNoCredential: "未登录，请前往设置完成登录",
  statusAuthExpired: "SPOC 登录状态已失效",
  statusFallback: "SPOC 作业加载失败",
  noticeLoading: "正在加载 SPOC 作业…",
  noticeNoCredential: "登录后查看作业。",
  noticeAuthExpired: "登录状态已失效，请到设置页重新登录。",
  noticeError: "SPOC 作业加载失败",
};

onMounted(() => {
  void refresh();
  if (routeAssignmentId.value.length > 0)
    openDetailById(routeAssignmentId.value);
});

watch(routeAssignmentId, (assignmentId) => {
  if (assignmentId.length > 0) openDetailById(assignmentId);
  else closeDetail();
});

function openAssignment(assignment: SpocAssignment): void {
  openDetail(assignment);
}

function closeDetailModal(): void {
  closeDetail();
  if (routeAssignmentId.value.length > 0) void router.replace("/spoc");
}

function retry(): void {
  void refresh();
}

function retryDetail(): void {
  void refreshDetail();
}
</script>

<template>
  <div class="home-backdrop min-h-screen text-white antialiased">
    <main class="mx-auto w-full max-w-4xl px-8 py-10">
      <PageHeader
        title="SPOC 作业"
        :subtitle="state.term?.name || '未提交且未截止的作业'"
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

        <section
          v-if="hasAssignments"
          class="mt-5 flex flex-col gap-2"
          aria-label="未提交且未截止的 SPOC 作业"
        >
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
          {{ isEmpty ? "暂无 SPOC 作业" : "暂无未完成作业" }}
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

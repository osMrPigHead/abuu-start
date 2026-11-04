<script setup lang="ts">
import { computed } from "vue";
import AppDialog from "@/components/common/AppDialog.vue";
import SourceStatusLine from "@/components/common/SourceStatusLine.vue";
import type { SpocAssignment, SpocAssignmentDetail } from "@shared/api";
import type { SourceStatus } from "@/types";
import { formatSpocDue, formatSpocStart } from "@/utils/spoc";

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 打开 modal 时列表已有的字段，详情失败时仍可展示。 */
    preview?: SpocAssignment | null;
    detail?: SpocAssignmentDetail | null;
    status?: SourceStatus;
    savedAt?: string | null;
    error?: string | null;
    loading?: boolean;
    notFound?: boolean;
  }>(),
  {
    preview: null,
    detail: null,
    status: "idle",
    savedAt: null,
    error: null,
    loading: false,
    notFound: false,
  },
);

const emit = defineEmits<{
  close: [];
  retry: [];
}>();

const TITLE_ID = "spoc-detail-dialog-title";

const assignment = computed(() => props.detail ?? props.preview);
const title = computed(() => assignment.value?.title || "SPOC 作业详情");
const courseName = computed(() => assignment.value?.courseName ?? "");
const teacherName = computed(() => assignment.value?.teacherName ?? "");
const submissionLabel = computed(
  () => assignment.value?.submissionStatusText ?? "未知",
);
const startText = computed(() =>
  formatSpocStart(assignment.value?.startTime ?? null),
);
const dueText = computed(() =>
  formatSpocDue(assignment.value?.dueTime ?? null),
);

const scoreText = computed(() => {
  if (!props.detail) return props.loading ? "加载中…" : "—";
  return props.detail.score ?? "暂无成绩";
});

const descriptionText = computed(() => props.detail?.contentText ?? "");
const attachments = computed(() => props.detail?.attachments ?? []);

const descriptionNotice = computed(() => {
  if (descriptionText.value.length > 0) return "";

  switch (props.status) {
    case "loading":
      return "正在加载作业说明…";
    case "no-credential":
      return "登录后可查看作业说明";
    case "auth-expired":
      return "登录状态已失效，暂无作业说明";
    case "error":
      return props.error || "作业说明加载失败";
    default:
      return props.detail ? "暂无作业说明" : "";
  }
});
</script>

<template>
  <AppDialog
    :open="open"
    :title-id="TITLE_ID"
    body-class="mt-4 pb-6"
    @close="emit('close')"
  >
    <template #header>
      <h2
        :id="TITLE_ID"
        class="text-[17px] font-medium leading-snug tracking-wide text-white/90"
      >
        {{ title }}
      </h2>
      <p v-if="courseName" class="mt-1 truncate text-xs text-white/45">
        {{ courseName }}
      </p>
      <p v-if="teacherName" class="mt-0.5 text-xs text-white/40">
        教师 {{ teacherName }}
      </p>
      <span
        v-if="assignment"
        class="mt-1.5 inline-flex rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 text-[10.5px] leading-tight text-white/55"
      >
        {{ submissionLabel }}
      </span>
    </template>

    <SourceStatusLine
      :status="status"
      :saved-at="savedAt"
      :error="error"
      :refreshing="loading"
      compact
      no-credential-text="未登录，请前往设置完成登录"
      auth-expired-text="SPOC 登录状态已失效"
      fallback-error-text="SPOC 作业加载失败"
      @retry="emit('retry')"
    />

    <div class="mt-4">
      <div
        v-if="notFound"
        class="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center text-sm text-white/55"
      >
        未找到该作业。
      </div>

      <template v-else-if="assignment">
        <dl
          class="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] leading-relaxed"
        >
          <div>
            <dt class="text-white/40">开始时间</dt>
            <dd class="mt-0.5 text-white/75">{{ startText }}</dd>
          </div>
          <div>
            <dt class="text-white/40">截止时间</dt>
            <dd class="mt-0.5 font-medium text-white/85">{{ dueText }}</dd>
          </div>
          <div>
            <dt class="text-white/40">提交状态</dt>
            <dd class="mt-0.5 text-white/75">{{ submissionLabel }}</dd>
          </div>
          <div>
            <dt class="text-white/40">成绩</dt>
            <dd class="mt-0.5 text-white/75">{{ scoreText }}</dd>
          </div>
        </dl>

        <div class="mt-5 border-t border-white/10 pt-4">
          <h3 class="text-xs tracking-wide text-white/40">作业说明</h3>
          <p
            v-if="descriptionText.length > 0"
            class="mt-2 max-h-60 overflow-y-auto whitespace-pre-line pr-1 text-[13px] leading-relaxed text-white/70"
          >
            {{ descriptionText }}
          </p>
          <p
            v-else-if="descriptionNotice"
            class="mt-2 text-[13px] leading-relaxed text-white/45"
          >
            {{ descriptionNotice }}
          </p>
        </div>

        <div
          v-if="attachments.length > 0"
          class="mt-5 border-t border-white/10 pt-4"
        >
          <h3 class="text-xs tracking-wide text-white/40">附件</h3>
          <ul class="mt-2 space-y-1 text-[13px] text-white/65">
            <li v-for="attachment in attachments" :key="attachment.name">
              {{ attachment.name }}
            </li>
          </ul>
        </div>
      </template>

      <div
        v-else-if="status === 'no-credential'"
        class="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center text-sm text-white/55"
      >
        登录后查看作业详情。
      </div>

      <div
        v-else-if="status === 'error'"
        class="rounded-2xl border border-dashed border-amber-200/20 px-5 py-8 text-center text-sm text-amber-100/75"
      >
        {{ error || "SPOC 作业加载失败" }}
      </div>

      <div
        v-else
        class="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center text-sm text-white/45"
      >
        正在加载作业详情…
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="ml-auto rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:bg-white/[0.11] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        @click="emit('close')"
      >
        关闭
      </button>
    </template>
  </AppDialog>
</template>

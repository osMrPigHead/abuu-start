<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppDialog from "@/components/common/AppDialog.vue";
import type { BykcCourse, BykcCourseDetail } from "@shared/api";
import type { SourceStatus } from "@/types";
import {
  bykcPlaceText,
  bykcStatusLabel,
  formatBykcDetailTime,
} from "@/domain/bykc";
import { formatStamp } from "@/utils/date";

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 打开 modal 时列表已有的字段，详情失败时仍可展示。 */
    preview?: BykcCourse | null;
    detail?: BykcCourseDetail | null;
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

const TITLE_ID = "bykc-course-modal-title";

const course = computed(() => props.detail ?? props.preview);
const title = computed(() => course.value?.courseName ?? "课程详情");
const statusLabel = computed(() =>
  course.value ? bykcStatusLabel(course.value.status) : "",
);
const timeText = computed(() =>
  course.value
    ? formatBykcDetailTime(course.value.startTime, course.value.endTime)
    : "时间待定",
);
const placeText = computed(() =>
  course.value ? bykcPlaceText(course.value.place) : "地点待定",
);
const teacherText = computed(() => course.value?.teacher ?? "");
const stamp = computed(() => formatStamp(props.savedAt));
const descriptionText = computed(() => props.detail?.descriptionText ?? "");

const statusNotice = computed(() => {
  if (props.notFound) return "课程不存在或已下架";

  switch (props.status) {
    case "loading":
      return "正在加载课程详情…";
    case "cached":
      return stamp.value ? `缓存于 ${stamp.value}` : "缓存数据";
    case "no-credential":
      return "未登录，请前往设置完成登录";
    case "auth-expired":
      return "博雅登录状态已失效";
    case "error":
      return props.error || "课程详情加载失败";
    default:
      return props.error ?? "";
  }
});

const showSettingsLink = computed(
  () => props.status === "no-credential" || props.status === "auth-expired",
);
const showRetry = computed(
  () =>
    props.status === "error" ||
    (props.status === "cached" && props.error !== null),
);

const descriptionNotice = computed(() => {
  if (descriptionText.value.length > 0) return "";

  switch (props.status) {
    case "loading":
      return "正在加载课程简介…";
    case "no-credential":
      return "登录后可查看课程简介";
    case "auth-expired":
      return "登录状态已失效，暂无课程简介";
    case "error":
      return props.error || "课程简介加载失败";
    default:
      return props.detail ? "暂无课程简介" : "";
  }
});
</script>

<template>
  <AppDialog
    :open="open"
    :title-id="TITLE_ID"
    body-class="mt-5 pb-6"
    @close="emit('close')"
  >
    <template #header>
      <h2
        :id="TITLE_ID"
        class="min-w-0 text-[17px] font-medium leading-snug tracking-wide text-white/90"
      >
        {{ title }}
      </h2>
      <span
        v-if="statusLabel"
        class="mt-1.5 inline-flex rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 text-[10.5px] leading-tight text-white/55"
      >
        {{ statusLabel }}
      </span>
    </template>

    <dl
      class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px] leading-relaxed"
    >
      <dt class="text-white/40">时间</dt>
      <dd class="min-w-0 text-white/75">{{ timeText }}</dd>

      <dt class="text-white/40">地点</dt>
      <dd class="min-w-0 text-white/75">{{ placeText }}</dd>

      <template v-if="teacherText">
        <dt class="text-white/40">教师</dt>
        <dd class="min-w-0 text-white/75">{{ teacherText }}</dd>
      </template>
    </dl>

    <div class="mt-5 border-t border-white/10 pt-4">
      <h3 class="text-xs tracking-wide text-white/40">课程简介</h3>
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

    <template #footer>
      <p
        v-if="statusNotice"
        class="min-w-0 flex-1 text-[11px] leading-relaxed text-white/40"
      >
        {{ statusNotice }}
      </p>

      <button
        v-if="showRetry"
        type="button"
        class="shrink-0 rounded-full border border-white/20 bg-white/[0.07] px-3.5 py-1.5 text-xs text-white/75 transition hover:border-white/35 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        @click="emit('retry')"
      >
        重试
      </button>

      <RouterLink
        v-if="showSettingsLink"
        to="/settings"
        class="shrink-0 rounded-full border border-white/20 bg-white/[0.07] px-3.5 py-1.5 text-xs text-white/75 transition hover:border-white/35 hover:text-white"
        @click="emit('close')"
      >
        前往设置
      </RouterLink>

      <button
        type="button"
        class="ml-auto shrink-0 rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:bg-white/[0.11] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        @click="emit('close')"
      >
        关闭
      </button>
    </template>
  </AppDialog>
</template>

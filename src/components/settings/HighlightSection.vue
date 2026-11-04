<script setup lang="ts">
import { computed, ref, watch } from "vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import {
  DEFAULT_HIGHLIGHT_LEAD_MINUTES,
  MAX_HIGHLIGHT_LEAD_MINUTES,
  MIN_HIGHLIGHT_LEAD_MINUTES,
} from "@/utils/schedule";

const props = defineProps<{
  leadMinutes: number;
  message: string;
}>();

const emit = defineEmits<{
  save: [minutes: number];
}>();

const draft = ref(String(props.leadMinutes));
const errorMessage = ref("");

watch(
  () => props.leadMinutes,
  (value) => {
    draft.value = String(value);
  },
);

const displayMessage = computed(() => errorMessage.value || props.message);

function save(): void {
  const value = Number(draft.value);
  if (
    draft.value.trim().length === 0 ||
    !Number.isInteger(value) ||
    value < MIN_HIGHLIGHT_LEAD_MINUTES ||
    value > MAX_HIGHLIGHT_LEAD_MINUTES
  ) {
    errorMessage.value = `请输入 ${MIN_HIGHLIGHT_LEAD_MINUTES}–${MAX_HIGHLIGHT_LEAD_MINUTES} 的整数`;
    return;
  }

  errorMessage.value = "";
  emit("save", value);
}

const buttonClass =
  "rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 backdrop-blur-xl transition hover:border-white/35 hover:bg-white/[0.11] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35";
const fieldClass =
  "w-full rounded-2xl border border-white/20 bg-slate-950/40 text-white/85 outline-none backdrop-blur-xl transition placeholder:text-white/30 focus:border-white/35";
</script>

<template>
  <SettingsSection
    title="日程高亮"
    description="课程开始前多少分钟进入高亮；0 表示只高亮进行中的课程。"
    :badge="`默认 ${DEFAULT_HIGHLIGHT_LEAD_MINUTES} 分钟`"
  >
    <div class="mt-4 flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-2">
        <span class="text-xs text-white/45">提前高亮分钟数</span>
        <input
          v-model="draft"
          type="number"
          :min="MIN_HIGHLIGHT_LEAD_MINUTES"
          :max="MAX_HIGHLIGHT_LEAD_MINUTES"
          step="1"
          :class="[fieldClass, 'h-11 w-40 px-4 text-[13px]']"
          aria-label="提前高亮分钟数"
          @keydown.enter="save"
        />
      </label>
      <button type="button" :class="buttonClass" @click="save">保存</button>
      <span class="pb-2 text-xs text-white/40">
        当前生效：{{ leadMinutes }} 分钟
      </span>
    </div>

    <p
      v-if="displayMessage"
      class="mt-2 text-xs text-white/55"
      aria-live="polite"
    >
      {{ displayMessage }}
    </p>

    <div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-white/45">
      <span class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-amber-300"></span>
        即将开始
      </span>
      <span class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-sky-300"></span>
        进行中
      </span>
    </div>
  </SettingsSection>
</template>

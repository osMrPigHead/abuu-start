<script setup lang="ts">
import { computed, ref, watch } from "vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import {
  isValidYgdkTermTarget,
  isValidYgdkWeekTarget,
  MAX_YGDK_TERM_TARGET,
  MAX_YGDK_WEEK_TARGET,
  MIN_YGDK_TERM_TARGET,
  MIN_YGDK_WEEK_TARGET,
} from "@/domain/ygdk";

const props = defineProps<{
  termTarget: number;
  weekTarget: number;
  effectiveTerm: number;
  effectiveWeek: number;
  message: string;
}>();

const emit = defineEmits<{
  save: [termTarget: number, weekTarget: number];
}>();

const termDraft = ref(String(props.termTarget));
const weekDraft = ref(String(props.weekTarget));
const errorMessage = ref("");

watch(
  () => props.termTarget,
  (value) => {
    termDraft.value = String(value);
  },
);

watch(
  () => props.weekTarget,
  (value) => {
    weekDraft.value = String(value);
  },
);

const displayMessage = computed(() => errorMessage.value || props.message);

function save(): void {
  const termTarget = Number(termDraft.value);
  if (!isValidYgdkTermTarget(termTarget)) {
    errorMessage.value = `学期目标需为 ${MIN_YGDK_TERM_TARGET}–${MAX_YGDK_TERM_TARGET} 的整数`;
    return;
  }

  const weekTarget = Number(weekDraft.value);
  if (!isValidYgdkWeekTarget(weekTarget)) {
    errorMessage.value = `周限制需为 ${MIN_YGDK_WEEK_TARGET}–${MAX_YGDK_WEEK_TARGET} 的整数`;
    return;
  }

  errorMessage.value = "";
  emit("save", termTarget, weekTarget);
}

const buttonClass =
  "rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 backdrop-blur-xl transition hover:border-white/35 hover:bg-white/[0.11] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35";
const fieldClass =
  "w-full rounded-2xl border border-white/20 bg-slate-950/40 text-white/85 outline-none backdrop-blur-xl transition placeholder:text-white/30 focus:border-white/35";
</script>

<template>
  <SettingsSection
    title="打卡目标"
    description="系统未给出学期目标时使用此值；周限制始终使用此值。"
  >
    <div class="mt-3 flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-2">
        <span class="text-xs text-white/45">学期目标</span>
        <input
          v-model="termDraft"
          type="number"
          :min="MIN_YGDK_TERM_TARGET"
          :max="MAX_YGDK_TERM_TARGET"
          step="1"
          :class="[fieldClass, 'h-11 w-32 px-4 text-[13px]']"
          aria-label="阳光学期目标"
          @keydown.enter="save"
        />
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-xs text-white/45">周限制</span>
        <input
          v-model="weekDraft"
          type="number"
          :min="MIN_YGDK_WEEK_TARGET"
          :max="MAX_YGDK_WEEK_TARGET"
          step="1"
          :class="[fieldClass, 'h-11 w-32 px-4 text-[13px]']"
          aria-label="阳光周限制"
          @keydown.enter="save"
        />
      </label>
      <button type="button" :class="buttonClass" @click="save">保存</button>
    </div>

    <p class="mt-2 text-xs text-white/40">
      当前生效：学期 {{ effectiveTerm }} 次 / 本周 {{ effectiveWeek }} 次
    </p>
    <p
      v-if="displayMessage"
      class="mt-1 text-xs text-white/55"
      aria-live="polite"
    >
      {{ displayMessage }}
    </p>
  </SettingsSection>
</template>

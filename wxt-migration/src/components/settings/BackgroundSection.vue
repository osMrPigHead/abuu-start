<script setup lang="ts">
import { computed, ref, watch } from "vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import type { BuiltinBackground } from "@/domain/background";

type BackgroundStateView = {
  directory: string | null;
  configured: boolean;
  images: readonly { name: string }[];
  selectedName: string | null;
  warning: string | null;
  message: string;
  messageKind: "info" | "error";
  busy: "save" | "rescan" | "clear" | null;
  fallback: boolean;
};

const props = defineProps<{
  state: BackgroundStateView;
  builtinBackground: BuiltinBackground | null;
}>();

const emit = defineEmits<{
  save: [path: string];
  rescan: [];
  clear: [];
}>();

const pathDraft = ref("");
const busy = computed(() => props.state.busy !== null);

watch(
  () => props.state.directory,
  (directory) => {
    pathDraft.value = directory ?? "";
  },
  { immediate: true },
);

const statusText = computed(() => {
  if (!props.state.configured) return "内置背景";
  if (props.state.images.length === 0) {
    return props.state.warning?.includes("没有可用图片")
      ? "无可用图片"
      : "目录异常";
  }
  return `已配置 · ${props.state.images.length} 张`;
});

const statusClass = computed(() => {
  if (props.state.configured && props.state.images.length > 0) {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100/85";
  }
  if (props.state.configured) {
    return "border-amber-300/25 bg-amber-300/10 text-amber-100/85";
  }
  return "border-white/15 bg-white/[0.04] text-white/45";
});

const customBackgroundActive = computed(
  () =>
    props.state.configured &&
    props.state.selectedName !== null &&
    !props.state.fallback,
);

const currentImage = computed(() =>
  customBackgroundActive.value
    ? (props.state.selectedName ?? "")
    : (props.builtinBackground?.fileName ?? "内置背景"),
);

const canSave = computed(
  () => pathDraft.value.trim().length > 0 && !busy.value,
);
const canRescan = computed(() => props.state.configured && !busy.value);
const canClear = computed(() => props.state.configured && !busy.value);

const saveText = computed(() =>
  props.state.busy === "save" ? "保存中" : "保存",
);
const rescanText = computed(() =>
  props.state.busy === "rescan" ? "扫描中" : "重新扫描",
);
const clearText = computed(() =>
  props.state.busy === "clear" ? "清除中" : "清除",
);

function save(): void {
  if (!canSave.value) return;
  emit("save", pathDraft.value);
}

const buttonClass =
  "rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 backdrop-blur-xl transition hover:border-white/35 hover:bg-white/[0.11] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35";
const dangerButtonClass =
  "rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-4 py-2 text-sm text-amber-100/75 backdrop-blur-xl transition hover:border-amber-200/35 hover:bg-amber-200/[0.1] hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-35";
const fieldClass =
  "w-full rounded-2xl border border-white/20 bg-slate-950/40 text-white/85 outline-none backdrop-blur-xl transition placeholder:text-white/30 focus:border-white/35";
</script>

<template>
  <SettingsSection
    title="背景"
    description="从本机目录第一层随机取一张图片，支持 jpg、jpeg、png、webp、gif、bmp、avif；图片不复制进仓库。"
    :badge="statusText"
    :badge-class="statusClass"
  >
    <div class="mt-4">
      <input
        v-model="pathDraft"
        :class="[fieldClass, 'h-11 px-4 font-mono text-[12px]']"
        placeholder="背景目录绝对路径"
        aria-label="背景目录绝对路径"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="save"
      />
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        :class="buttonClass"
        :disabled="!canSave"
        @click="save"
      >
        {{ saveText }}
      </button>
      <button
        type="button"
        :class="buttonClass"
        :disabled="!canRescan"
        @click="emit('rescan')"
      >
        {{ rescanText }}
      </button>
      <button
        type="button"
        :class="dangerButtonClass"
        :disabled="!canClear"
        @click="emit('clear')"
      >
        {{ clearText }}
      </button>
    </div>

    <div class="mt-3 space-y-1">
      <p class="flex min-w-0 items-center gap-1 text-xs text-white/40">
        <span class="shrink-0">当前目录：</span>
        <span
          class="truncate font-mono text-white/60"
          :title="state.directory ?? ''"
        >
          {{ state.directory ?? "未配置，使用内置背景" }}
        </span>
      </p>
      <p class="flex min-w-0 items-center gap-1 text-xs text-white/40">
        <span class="shrink-0">当前背景：</span>
        <span
          v-if="customBackgroundActive"
          class="truncate font-mono text-white/60"
          :title="currentImage"
        >
          {{ currentImage }}
        </span>
        <span
          v-else
          class="min-w-0 truncate text-white/60"
          :title="currentImage"
        >
          内置背景<template v-if="builtinBackground"
            >（图源<a
              :href="builtinBackground.sourceUrl ?? undefined"
              class="text-white/80 underline decoration-white/25 underline-offset-2 transition hover:text-white"
              target="_blank"
              rel="noreferrer noopener"
              >{{ builtinBackground.sourceName }}</a
            >，作者{{ builtinBackground.author }}）</template
          ><template v-else>（无可用图片）</template>
        </span>
      </p>
    </div>

    <p
      v-if="state.warning"
      class="mt-2 text-xs leading-relaxed text-amber-100/75"
      aria-live="polite"
    >
      {{ state.warning }}
    </p>
    <p
      v-if="state.message"
      class="mt-2 text-xs"
      :class="
        state.messageKind === 'error' ? 'text-amber-100/75' : 'text-white/55'
      "
      aria-live="polite"
    >
      {{ state.message }}
    </p>
  </SettingsSection>
</template>

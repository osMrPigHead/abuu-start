<script setup lang="ts">
import { RouterLink } from "vue-router";

withDefaults(
  defineProps<{
    kind: "loading" | "no-credential" | "auth-expired" | "error";
    message: string;
    settingsLink?: boolean;
    retryable?: boolean;
    retryLabel?: string;
  }>(),
  {
    settingsLink: false,
    retryable: false,
    retryLabel: "重试",
  },
);

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div
    class="mt-5 rounded-2xl border border-dashed px-5 py-10 text-center"
    :class="
      kind === 'error' || kind === 'auth-expired'
        ? 'border-amber-200/20'
        : 'border-white/12'
    "
  >
    <p
      class="text-sm"
      :class="
        kind === 'error' || kind === 'auth-expired'
          ? 'text-amber-100/75'
          : 'text-white/45'
      "
    >
      {{ message }}
    </p>

    <div v-if="settingsLink || retryable" class="mt-3">
      <RouterLink
        v-if="settingsLink"
        to="/settings"
        class="inline-flex rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:text-white"
      >
        前往设置
      </RouterLink>

      <button
        v-else-if="retryable"
        type="button"
        class="inline-flex rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 transition hover:border-white/35 hover:text-white"
        @click="emit('retry')"
      >
        {{ retryLabel }}
      </button>
    </div>
  </div>
</template>

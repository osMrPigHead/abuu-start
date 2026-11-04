<script setup lang="ts">
import { RouterLink } from "vue-router";

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    backTo?: string;
    backLabel?: string;
    showBack?: boolean;
  }>(),
  {
    subtitle: "",
    backTo: "/",
    backLabel: "返回主页",
    showBack: true,
  },
);
</script>

<template>
  <header
    class="route-page-header flex flex-wrap items-end justify-between gap-4"
  >
    <div>
      <h1 class="text-2xl font-semibold tracking-wide">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-white/45">{{ subtitle }}</p>
      <slot name="meta"></slot>
    </div>

    <slot name="actions">
      <RouterLink
        v-if="showBack"
        :to="backTo"
        class="rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/75 transition hover:border-white/35 hover:text-white"
      >
        {{ backLabel }}
      </RouterLink>
    </slot>
  </header>
</template>

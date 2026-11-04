<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    badge?: string;
    badgeClass?: string;
  }>(),
  {
    description: "",
    badge: "",
    badgeClass: "border-white/15 bg-white/[0.04] text-white/45",
  },
);
</script>

<template>
  <section
    class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
  >
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2 class="text-base font-medium text-white/90">{{ title }}</h2>
        <p
          v-if="description"
          class="mt-1 text-xs leading-relaxed text-white/45"
        >
          {{ description }}
        </p>
      </div>
      <span
        v-if="badge"
        class="shrink-0 rounded-full border px-2.5 py-1 text-[11px]"
        :class="badgeClass"
      >
        {{ badge }}
      </span>
    </div>

    <slot></slot>
  </section>
</template>

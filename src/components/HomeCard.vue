<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    badge?: string
    dense?: boolean
    compact?: boolean
  }>(),
  {
    badge: '',
    dense: false,
    compact: false,
  },
)
</script>

<template>
  <section
    class="relative flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-950/45 backdrop-blur-md transition-colors duration-300 before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent hover:border-white/25 hover:bg-slate-950/55"
    :class="compact ? 'p-3' : dense ? 'p-4' : 'p-5'"
  >
    <header class="flex items-start justify-between gap-3">
      <h2 class="text-[15px] font-medium tracking-wide text-white/90">{{ title }}</h2>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
        <span
          v-if="badge"
          class="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] tracking-wide text-white/35"
        >
          {{ badge }}
        </span>
      </div>
    </header>

    <div
      class="flex min-h-0 flex-1 flex-col"
      :class="compact ? 'mt-1.5' : dense ? 'mt-2' : 'mt-4'"
    >
      <slot />
    </div>
  </section>
</template>

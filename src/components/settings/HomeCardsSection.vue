<script setup lang="ts">
import SettingsSection from "@/components/settings/SettingsSection.vue";
import type { HomeCardId } from "@/composables/useHomeCards";
import type { HomeCardVisibility } from "@/domain/homeLayout";

defineProps<{
  options: readonly { id: HomeCardId; title: string; hint: string }[];
  visibility: HomeCardVisibility;
  message: string;
}>();

const emit = defineEmits<{
  toggle: [id: HomeCardId];
}>();
</script>

<template>
  <SettingsSection
    title="主页卡片"
    description="关闭后主页不显示该卡片，并停止请求对应数据源；重新开启后按缓存优先刷新。"
    badge="默认全部开启"
  >
    <div class="mt-2">
      <div
        v-for="option in options"
        :key="option.id"
        class="flex items-center justify-between gap-4 border-b border-white/10 py-3 last:border-b-0"
      >
        <div class="min-w-0">
          <p class="text-sm text-white/80">{{ option.title }}</p>
          <p class="mt-1 text-xs leading-relaxed text-white/45">
            {{ option.hint }}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="visibility[option.id]"
          :aria-label="`${option.title}卡片开关`"
          class="relative h-6 w-11 shrink-0 rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
          :class="
            visibility[option.id]
              ? 'border-sky-300/40 bg-sky-300/25'
              : 'border-white/20 bg-white/10'
          "
          @click="emit('toggle', option.id)"
        >
          <span
            class="absolute top-1 h-4 w-4 rounded-full bg-white transition-all"
            :class="visibility[option.id] ? 'left-6' : 'left-0.5'"
          ></span>
        </button>
      </div>
    </div>

    <p v-if="message" class="mt-2 text-xs text-white/55" aria-live="polite">
      {{ message }}
    </p>
  </SettingsSection>
</template>

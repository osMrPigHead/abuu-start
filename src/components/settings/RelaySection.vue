<script setup lang="ts">
import SettingsSection from "@/components/settings/SettingsSection.vue";

defineProps<{
  text: string;
  message: string;
  textClass: string;
}>();

const emit = defineEmits<{
  check: [];
}>();

const buttonClass =
  "rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 backdrop-blur-xl transition hover:border-white/35 hover:bg-white/[0.11] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35";
</script>

<template>
  <SettingsSection title="本地中继">
    <div class="mt-4 flex items-center justify-between gap-4">
      <p class="text-xs text-white/45">{{ message }}</p>
      <div class="flex items-center gap-3">
        <span class="text-sm" :class="textClass">{{ text }}</span>
        <button type="button" :class="buttonClass" @click="emit('check')">
          检查
        </button>
      </div>
    </div>
  </SettingsSection>
</template>

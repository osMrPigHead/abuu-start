<script setup lang="ts">
import { RouterLink } from 'vue-router'

withDefaults(
  defineProps<{
    retryable?: boolean
    needsSettings?: boolean
  }>(),
  {
    retryable: false,
    needsSettings: false,
  },
)

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <button
    v-if="retryable"
    type="button"
    class="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[9px] text-white/65 transition hover:border-white/30 hover:text-white"
    @click.stop="emit('retry')"
    @keydown.stop
  >
    重试
  </button>
  <RouterLink
    v-if="needsSettings"
    to="/settings"
    class="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[9px] text-white/65 transition hover:border-white/30 hover:text-white"
    @click.stop
    @keydown.stop
  >
    设置
  </RouterLink>
</template>

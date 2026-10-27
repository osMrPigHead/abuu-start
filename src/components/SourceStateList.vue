<script setup lang="ts">
/** 统一登录区的四源状态行，见 docs/ui-lowfi.md 设置。 */
import { computed, ref, watch } from 'vue'
import { AUTH_SOURCE_LABELS, AUTH_SOURCE_ORDER } from '@/composables/useAuth'
import type { AuthSourceId, AuthSources, AuthSourceState } from '@/types'
import { formatStamp } from '@/utils/date'

const props = defineProps<{
  sources: AuthSources
}>()

const emit = defineEmits<{
  retry: [source: AuthSourceId]
}>()

const retrying = ref<AuthSourceId | null>(null)

// 父组件更新状态后结束「重试中」。
watch(
  () => props.sources,
  () => {
    retrying.value = null
  },
  { deep: true },
)

const rows = computed(() =>
  AUTH_SOURCE_ORDER.map((id) => ({
    id,
    label: AUTH_SOURCE_LABELS[id],
    state: props.sources[id],
  })),
)

function statusText(state: AuthSourceState): string {
  switch (state.status) {
    case 'ready': {
      const time = formatStamp(state.updatedAt)
      return time ? `已派生 · ${time}` : '已派生'
    }
    case 'pending':
      return '派生中'
    case 'failed':
      return '派生失败'
    case 'expired':
      return '已失效'
    default:
      return '未派生'
  }
}

function statusClass(state: AuthSourceState): string {
  switch (state.status) {
    case 'ready':
      return 'text-emerald-100/80'
    case 'pending':
      return 'text-sky-100/80'
    case 'failed':
    case 'expired':
      return 'text-amber-100/80'
    default:
      return 'text-white/45'
  }
}

function canRetry(state: AuthSourceState): boolean {
  return state.status === 'failed' || state.status === 'expired'
}

function onRetry(source: AuthSourceId): void {
  if (retrying.value !== null) return
  retrying.value = source
  emit('retry', source)
}
</script>

<template>
  <div class="mt-5 border-t border-white/10 pt-4">
    <h3 class="text-sm font-medium text-white/80">数据源</h3>

    <div class="mt-2">
      <div
        v-for="row in rows"
        :key="row.id"
        class="flex items-center justify-between gap-3 border-b border-white/10 py-2.5 last:border-b-0"
      >
        <span class="shrink-0 text-sm text-white/75">{{ row.label }}</span>
        <div class="flex min-w-0 items-center gap-2">
          <span
            class="min-w-0 truncate text-xs"
            :class="statusClass(row.state)"
            :title="row.state.error?.message ?? ''"
          >
            {{ statusText(row.state) }}
          </span>
          <button
            v-if="canRetry(row.state)"
            type="button"
            class="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/60 transition hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35"
            :disabled="retrying !== null"
            @click="onRetry(row.id)"
          >
            {{ retrying === row.id ? '重试中' : '重试' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

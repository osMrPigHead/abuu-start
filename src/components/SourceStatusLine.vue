<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { SourceStatus } from '@/types'
import { formatStamp } from '@/utils/date'

const props = withDefaults(
  defineProps<{
    status: SourceStatus
    savedAt?: string | null
    error?: string | null
    warning?: string | null
    refreshing?: boolean
    compact?: boolean
  }>(),
  {
    savedAt: null,
    error: null,
    warning: null,
    refreshing: false,
    compact: false,
  },
)

const emit = defineEmits<{
  retry: []
}>()

const stamp = computed(() => formatStamp(props.savedAt))

const text = computed(() => {
  const time = stamp.value
  const cachedText = time ? `缓存于 ${time}` : '缓存数据'
  const refreshingSuffix = props.refreshing ? ' · 正在刷新…' : ''

  switch (props.status) {
    case 'no-credential':
      return time ? `${cachedText} · 未配置 Cookie` : '未配置本研教育管理系统 Cookie'
    case 'auth-expired':
      return time ? `${cachedText} · 登录状态已失效` : '登录状态已失效，请更新 Cookie'
    case 'error':
      return props.error || '课表加载失败'
    case 'loading':
      return time ? `${cachedText} · 正在刷新…` : '正在加载…'
    case 'cached':
      return `${cachedText}${refreshingSuffix}`
    case 'ok':
      return `${time ? `已同步 ${time}` : '已同步'}${refreshingSuffix}`
    default:
      return '等待加载'
  }
})

const showSettingsLink = computed(
  () => props.status === 'no-credential' || props.status === 'auth-expired',
)
const showRetry = computed(
  () => props.status === 'error' || (props.status === 'cached' && !!props.error),
)
const showRefresh = computed(
  () =>
    !props.refreshing &&
    (props.status === 'ok' || (props.status === 'cached' && !props.error)),
)
const showInlineError = computed(
  () =>
    props.error !== null &&
    props.status !== 'error' &&
    props.status !== 'auth-expired' &&
    props.status !== 'no-credential',
)
</script>

<template>
  <div class="min-w-0">
    <div
      class="flex flex-wrap items-center gap-x-2 gap-y-1 text-white/45"
      :class="compact ? 'text-[9.5px]' : 'text-[11px]'"
    >
      <span class="min-w-0">{{ text }}</span>
      <span v-if="showInlineError" class="min-w-0 text-white/35">· {{ error }}</span>

      <RouterLink
        v-if="showSettingsLink"
        to="/settings"
        class="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-white/65 transition hover:border-white/30 hover:text-white"
      >
        前往设置
      </RouterLink>

      <button
        v-if="showRetry"
        type="button"
        class="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-white/65 transition hover:border-white/30 hover:text-white"
        @click="emit('retry')"
      >
        重试
      </button>

      <button
        v-if="showRefresh"
        type="button"
        class="shrink-0 rounded-full px-1.5 py-0.5 text-white/45 transition hover:text-white"
        @click="emit('retry')"
      >
        刷新
      </button>
    </div>

    <p
      v-if="warning"
      class="mt-1 text-amber-200/65"
      :class="compact ? 'text-[9.5px]' : 'text-[11px]'"
    >
      {{ warning }}
    </p>
  </div>
</template>

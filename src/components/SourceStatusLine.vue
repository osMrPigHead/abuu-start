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
    noCredentialText?: string
    authExpiredText?: string
    fallbackErrorText?: string
    /** 同行的第二个数据源（博雅已选课程）；不传时只显示主数据源。 */
    secondaryLabel?: string | null
    secondaryStatus?: SourceStatus | null
    secondarySavedAt?: string | null
    secondaryError?: string | null
    secondaryRefreshing?: boolean
    secondaryNoCredentialText?: string
    secondaryAuthExpiredText?: string
  }>(),
  {
    savedAt: null,
    error: null,
    warning: null,
    refreshing: false,
    compact: false,
    noCredentialText: '未登录，请前往设置完成登录',
    authExpiredText: '登录状态已失效，请重新登录',
    fallbackErrorText: '课表加载失败',
    secondaryLabel: null,
    secondaryStatus: null,
    secondarySavedAt: null,
    secondaryError: null,
    secondaryRefreshing: false,
    secondaryNoCredentialText: '未登录，请前往设置完成登录',
    secondaryAuthExpiredText: '登录状态已失效，请重新登录',
  },
)

const emit = defineEmits<{
  retry: []
  'retry-secondary': []
}>()

const hasSecondary = computed(
  () => props.secondaryLabel !== null && props.secondaryStatus !== null,
)

const text = computed(() =>
  statusText(props.status, props.savedAt, props.error, props.refreshing, {
    noCredential: props.noCredentialText,
    authExpired: props.authExpiredText,
    fallback: props.fallbackErrorText,
  }),
)

const secondaryText = computed(() => {
  const status = props.secondaryStatus
  if (status === null) return ''

  return statusText(status, props.secondarySavedAt, props.secondaryError, props.secondaryRefreshing, {
    noCredential: props.secondaryNoCredentialText,
    authExpired: props.secondaryAuthExpiredText,
    fallback: '博雅课程加载失败',
  })
})

const showSettingsLink = computed(
  () =>
    needsSettings(props.status) ||
    (props.secondaryStatus !== null && needsSettings(props.secondaryStatus)),
)
const showRetry = computed(() => canRetry(props.status, props.error))
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

const secondaryShowRetry = computed(() =>
  props.secondaryStatus === null ? false : canRetry(props.secondaryStatus, props.secondaryError),
)
const secondaryShowRefresh = computed(
  () =>
    props.secondaryStatus !== null &&
    !props.compact &&
    !props.secondaryRefreshing &&
    (props.secondaryStatus === 'ok' ||
      (props.secondaryStatus === 'cached' && !props.secondaryError)),
)
const secondaryShowInlineError = computed(
  () =>
    props.secondaryError !== null &&
    props.secondaryStatus !== null &&
    props.secondaryStatus !== 'error' &&
    props.secondaryStatus !== 'auth-expired' &&
    props.secondaryStatus !== 'no-credential',
)

function statusText(
  status: SourceStatus,
  savedAt: string | null,
  error: string | null,
  refreshing: boolean,
  fallback: { noCredential: string; authExpired: string; fallback: string },
): string {
  const time = formatStamp(savedAt)
  const cachedText = time ? `缓存于 ${time}` : '缓存数据'
  const refreshingSuffix = refreshing ? ' · 正在刷新…' : ''

  switch (status) {
    case 'no-credential':
      return time ? `${cachedText} · ${fallback.noCredential}` : fallback.noCredential
    case 'auth-expired':
      return time ? `${cachedText} · ${fallback.authExpired}` : fallback.authExpired
    case 'error':
      return error || fallback.fallback
    case 'loading':
      return time ? `${cachedText} · 正在刷新…` : '正在加载…'
    case 'cached':
      return `${cachedText}${refreshingSuffix}`
    case 'ok':
      return `${time ? `已同步 ${time}` : '已同步'}${refreshingSuffix}`
    default:
      return '等待加载'
  }
}

function needsSettings(status: SourceStatus): boolean {
  return status === 'no-credential' || status === 'auth-expired'
}

function canRetry(status: SourceStatus, error: string | null): boolean {
  return status === 'error' || (status === 'cached' && error !== null)
}
</script>

<template>
  <div class="min-w-0">
    <div
      class="flex flex-wrap items-center gap-x-2 gap-y-1 text-white/45"
      :class="compact ? 'text-[9.5px]' : 'text-[11px]'"
    >
      <span class="min-w-0">{{ text }}</span>
      <span v-if="showInlineError" class="min-w-0 text-white/35">· {{ error }}</span>

      <template v-if="hasSecondary">
        <span aria-hidden="true" class="text-white/25">·</span>
        <span class="min-w-0">{{ secondaryLabel }} {{ secondaryText }}</span>
        <span v-if="secondaryShowInlineError" class="min-w-0 text-white/35">
          · {{ secondaryError }}
        </span>
      </template>

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
        v-if="secondaryShowRetry"
        type="button"
        class="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-white/65 transition hover:border-white/30 hover:text-white"
        @click="emit('retry-secondary')"
      >
        重试博雅
      </button>

      <button
        v-if="showRefresh"
        type="button"
        class="shrink-0 rounded-full px-1.5 py-0.5 text-white/45 transition hover:text-white"
        @click="emit('retry')"
      >
        刷新
      </button>

      <button
        v-if="secondaryShowRefresh"
        type="button"
        class="shrink-0 rounded-full px-1.5 py-0.5 text-white/45 transition hover:text-white"
        @click="emit('retry-secondary')"
      >
        刷新博雅
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

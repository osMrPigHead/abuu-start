<script setup lang="ts">
import { computed } from 'vue'
import CardStatusActions from '@/components/CardStatusActions.vue'
import HomeCard from '@/components/HomeCard.vue'
import type { SourceStatus, YgdkOverview } from '@/types'
import {
  canRetrySource,
  needsSettingsSource,
  resolveSourceBadge,
} from '@/utils/sourceStatus'
import {
  DEFAULT_YGDK_TERM_TARGET,
  DEFAULT_YGDK_WEEK_TARGET,
  ygdkProgressPercent,
} from '@/utils/ygdk'

const props = withDefaults(
  defineProps<{
    status?: SourceStatus
    overview?: YgdkOverview | null
    /** 学期目标：由主页按“系统值优先、否则用户设置”解析后传入。 */
    termTarget?: number
    /** 周限制：始终为设置页的用户值。 */
    weekLimit?: number
    savedAt?: string | null
    error?: string | null
    loading?: boolean
  }>(),
  {
    status: 'no-credential',
    overview: null,
    termTarget: DEFAULT_YGDK_TERM_TARGET,
    weekLimit: DEFAULT_YGDK_WEEK_TARGET,
    savedAt: null,
    error: null,
    loading: false,
  },
)

const emit = defineEmits<{
  retry: []
}>()

const badge = computed(() =>
  resolveSourceBadge({
    status: props.status,
    savedAt: props.savedAt,
    loading: props.loading,
  }),
)

const rows = computed(() => {
  const overview = props.overview
  if (!overview) return []

  return [
    {
      label: '学期',
      value: `${overview.termCount} / ${props.termTarget}`,
      percent: ygdkProgressPercent(overview.termCount, props.termTarget),
      detail: '学期进度',
    },
    {
      label: '本周',
      value: `${overview.weekCount} / ${props.weekLimit}`,
      percent: ygdkProgressPercent(overview.weekCount, props.weekLimit),
      detail: '本周进度',
    },
  ]
})

const emptyText = computed(() => {
  switch (props.status) {
    case 'no-credential':
      return '未登录'
    case 'auth-expired':
      return '登录状态已失效'
    case 'error':
      return props.error || '加载失败'
    case 'loading':
      return '正在加载…'
    default:
      return '暂无数据'
  }
})

const canRetry = computed(() => canRetrySource({ status: props.status, error: props.error }))
const showSettingsLink = computed(() => needsSettingsSource({ status: props.status }))
</script>

<template>
  <HomeCard title="阳光打卡" :badge="badge" compact class="h-full w-full">
    <template #actions>
      <CardStatusActions
        :retryable="canRetry"
        :needs-settings="showSettingsLink"
        @retry="emit('retry')"
      />
    </template>

    <div class="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
      <template v-if="rows.length > 0">
        <div v-for="row in rows" :key="row.label">
          <div class="flex items-baseline justify-between gap-2 text-[10px] leading-none">
            <span class="text-white/45">{{ row.label }}</span>
            <span class="truncate font-medium text-white/70">{{ row.value }}</span>
          </div>
          <div
            class="mt-1 h-1 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            :aria-label="row.detail"
            :aria-valuenow="row.percent"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full rounded-full bg-amber-200/70 transition-[width] duration-300"
              :style="{ width: `${row.percent}%` }"
            ></div>
          </div>
        </div>
      </template>

      <p v-else class="text-[9.5px] leading-tight text-white/40">{{ emptyText }}</p>
    </div>
  </HomeCard>
</template>

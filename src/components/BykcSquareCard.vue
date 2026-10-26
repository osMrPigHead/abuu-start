<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BykcCourseCard from '@/components/BykcCourseCard.vue'
import HomeCard from '@/components/HomeCard.vue'
import type { BykcCourse, SourceStatus } from '@/types'
import { formatStamp } from '@/utils/date'

const props = withDefaults(
  defineProps<{
    courses?: BykcCourse[]
    status?: SourceStatus
    savedAt?: string | null
    error?: string | null
    loading?: boolean
  }>(),
  {
    courses: () => [],
    status: 'no-credential',
    savedAt: null,
    error: null,
    loading: false,
  },
)

const emit = defineEmits<{
  open: [course: BykcCourse]
  retry: []
}>()

const picked = ref<BykcCourse[]>([])

/**
 * 课程列表刷新时保留当前 3 门（仍在列表内的），避免后台刷新导致卡片跳动；
 * 首次加载或课程全部变化时再随机。
 */
watch(
  () => props.courses,
  () => {
    if (props.courses.length === 0) {
      picked.value = []
      return
    }

    const byId = new Map(props.courses.map((course) => [course.id, course]))
    const kept = picked.value
      .map((course) => byId.get(course.id))
      .filter((course): course is BykcCourse => course !== undefined)

    if (kept.length > 0) {
      const keptIds = new Set(kept.map((course) => course.id))
      const extra = shuffle(props.courses.filter((course) => !keptIds.has(course.id)))
      picked.value = [...kept, ...extra].slice(0, Math.min(3, props.courses.length))
      return
    }

    pickCourses()
  },
  { immediate: true, deep: true },
)

/** 优先避开当前三张卡；课程不足时允许重复。 */
function pickCourses(): void {
  if (props.courses.length === 0) {
    picked.value = []
    return
  }

  const previousIds = new Set(picked.value.map((course) => course.id))
  const fresh = shuffle(props.courses.filter((course) => !previousIds.has(course.id)))
  const repeated = shuffle(props.courses.filter((course) => previousIds.has(course.id)))
  picked.value = [...fresh, ...repeated].slice(0, 3)
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = result[index]
    const other = result[swap]
    if (current === undefined || other === undefined) continue
    result[index] = other
    result[swap] = current
  }
  return result
}

const stamp = computed(() => formatStamp(props.savedAt))
const hasCourses = computed(() => props.courses.length > 0)
const cacheLabel = computed(() => (stamp.value ? `缓存于 ${stamp.value}` : '缓存'))

const badge = computed(() => {
  switch (props.status) {
    case 'ok':
      return '已同步'
    case 'loading':
      return '同步中'
    case 'cached':
      return cacheLabel.value
    case 'auth-expired':
      return hasCourses.value ? cacheLabel.value : '已失效'
    case 'error':
      return hasCourses.value ? cacheLabel.value : '加载失败'
    case 'no-credential':
      return hasCourses.value ? cacheLabel.value : '未配置'
    default:
      return '未配置'
  }
})

const emptyText = computed(() => {
  switch (props.status) {
    case 'loading':
      return '正在加载课程广场…'
    case 'no-credential':
      return '配置博雅 auth_token 后查看推荐课程'
    case 'auth-expired':
      return '凭据已失效，请到设置页更新'
    case 'error':
      return props.error || '课程广场加载失败'
    default:
      return '暂无推荐课程'
  }
})

const canRetry = computed(
  () => props.status === 'error' || (props.status === 'cached' && props.error !== null),
)
const showSettingsLink = computed(
  () => props.status === 'no-credential' || props.status === 'auth-expired',
)
</script>

<template>
  <HomeCard title="博雅课程广场" :badge="badge" dense class="h-full w-full">
    <template #actions>
      <button
        v-if="canRetry"
        type="button"
        class="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[9px] text-white/65 transition hover:border-white/30 hover:text-white"
        @click="emit('retry')"
      >
        重试
      </button>
      <RouterLink
        v-if="showSettingsLink"
        to="/settings"
        class="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[9px] text-white/65 transition hover:border-white/30 hover:text-white"
      >
        设置
      </RouterLink>
    </template>

    <div class="flex min-h-0 flex-1 flex-col gap-1.5">
      <template v-if="picked.length > 0">
        <BykcCourseCard
          v-for="course in picked"
          :key="course.id"
          :course="course"
          compact
          @open="emit('open', course)"
        />
      </template>

      <p
        v-else
        class="flex flex-1 items-center justify-center px-1 text-center text-[11px] leading-relaxed text-white/40"
      >
        {{ emptyText }}
      </p>

      <div class="flex shrink-0 items-center justify-between gap-2 pt-0.5">
        <RouterLink
          to="/bykc"
          class="shrink-0 rounded-full px-1 py-0.5 text-[9px] text-white/45 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        >
          查看全部
        </RouterLink>
        <button
          type="button"
          class="shrink-0 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[9px] text-white/55 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35"
          :disabled="courses.length === 0"
          @click="pickCourses"
        >
          换一批
        </button>
      </div>
    </div>
  </HomeCard>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BackHomeLink from '@/components/BackHomeLink.vue'
import LoginSection from '@/components/LoginSection.vue'
import SourceStateList from '@/components/SourceStateList.vue'
import { useAuth } from '@/composables/useAuth'
import { useBackground } from '@/composables/useBackground'
import { useBykc, useBykcChosen } from '@/composables/useBykc'
import { useExams } from '@/composables/useExams'
import {
  HOME_CARD_OPTIONS,
  useHomeCards,
  type HomeCardId,
} from '@/composables/useHomeCards'
import { usePomodoro } from '@/composables/usePomodoro'
import { useRelay, type RelayStatus } from '@/composables/useRelay'
import { useSchedule } from '@/composables/useSchedule'
import {
  isValidHighlightLeadMinutes,
  useScheduleSettings,
} from '@/composables/useScheduleSettings'
import { useSpoc } from '@/composables/useSpoc'
import { useYgdk } from '@/composables/useYgdk'
import { useYgdkSettings } from '@/composables/useYgdkSettings'
import {
  DEFAULT_HIGHLIGHT_LEAD_MINUTES,
  MAX_HIGHLIGHT_LEAD_MINUTES,
  MIN_HIGHLIGHT_LEAD_MINUTES,
} from '@/utils/schedule'
import {
  isValidYgdkTermTarget,
  isValidYgdkWeekTarget,
  MAX_YGDK_TERM_TARGET,
  MAX_YGDK_WEEK_TARGET,
  MIN_YGDK_TERM_TARGET,
  MIN_YGDK_WEEK_TARGET,
  resolveYgdkTermTarget,
  resolveYgdkWeekLimit,
} from '@/utils/ygdk'
import { clearCache, isStorageDegraded } from '@/utils/storage'
import type { AuthSourceId } from '@/types'

const {
  state: authState,
  refreshStatus: refreshAuthStatus,
  preload: preloadAuth,
  login: requestLogin,
  retrySource: retryAuthSource,
  logout: logoutAuth,
  pollWhileDeriving,
} = useAuth()
const { state: relayState, checkRelay } = useRelay()
const { refreshCurrent, clearScheduleData } = useSchedule()
const { refresh: refreshExams, clearExamsData } = useExams()
const { refresh: refreshSpoc, clearSpocData } = useSpoc()
const { refresh: refreshBykc, clearBykcData } = useBykc()
const { refresh: refreshBykcChosen } = useBykcChosen()
const { state: ygdkState, refresh: refreshYgdk, clearYgdkData } = useYgdk()
const { highlightLeadMinutes, setHighlightLeadMinutes } = useScheduleSettings()
const { visibility: homeCardVisibility, setVisible: setHomeCardVisible } = useHomeCards()
const {
  state: backgroundState,
  builtinBackground,
  hydrate: hydrateBackground,
  saveDirectory: saveBackgroundDirectory,
  clearDirectory: clearBackgroundDirectory,
  rescan: rescanBackground,
} = useBackground()
const {
  termTarget: ygdkUserTermTarget,
  weekTarget: ygdkUserWeekTarget,
  setTermTarget: setYgdkTermTarget,
  setWeekTarget: setYgdkWeekTarget,
} = useYgdkSettings()
const {
  notificationsEnabled: pomodoroNotificationsEnabled,
  notificationBusy: pomodoroNotificationBusy,
  notificationMessage: pomodoroNotificationMessage,
  notificationPermission: pomodoroNotificationPermission,
  refreshNotificationPermission: refreshPomodoroNotificationPermission,
  testNotification: testPomodoroNotification,
  setNotificationsEnabled: setPomodoroNotificationsEnabled,
} = usePomodoro()

const cacheMessage = ref('')
const degraded = ref(false)
const leadDraft = ref(String(highlightLeadMinutes.value))
const leadMessage = ref('')
const homeCardMessage = ref('')
const backgroundPathDraft = ref('')
const ygdkTermDraft = ref(String(ygdkUserTermTarget.value))
const ygdkWeekDraft = ref(String(ygdkUserWeekTarget.value))
const ygdkTargetMessage = ref('')

let stopDerivationPolling: (() => void) | null = null

/** 学期目标优先系统值；周限制始终用设置值，与主页卡片口径一致。 */
const ygdkEffectiveTermTarget = computed(() =>
  resolveYgdkTermTarget(ygdkState.overview?.termTarget ?? 0, ygdkUserTermTarget.value),
)
const ygdkEffectiveWeekLimit = computed(() => resolveYgdkWeekLimit(ygdkUserWeekTarget.value))
const relayText = computed(() => relayStatusText(relayState.status))
const relayMessage = computed(() => relayState.message)
const relayClass = computed(() =>
  relayState.status === 'ok'
    ? 'text-emerald-200/80'
    : relayState.status === 'error'
      ? 'text-amber-200/80'
      : 'text-white/45',
)
const pomodoroPermissionText = computed(() => {
  switch (pomodoroNotificationPermission.value) {
    case 'granted':
      return '已授权'
    case 'denied':
      return '已拒绝'
    case 'default':
      return '待授权'
    default:
      return '当前浏览器不支持'
  }
})

const backgroundBusy = computed(() => backgroundState.busy !== null)
const backgroundStatusText = computed(() => {
  if (!backgroundState.configured) return '内置背景'
  if (backgroundState.images.length === 0) {
    return backgroundState.warning?.includes('没有可用图片') ? '无可用图片' : '目录异常'
  }
  return `已配置 · ${backgroundState.images.length} 张`
})
const backgroundStatusClass = computed(() => {
  if (backgroundState.configured && backgroundState.images.length > 0) {
    return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100/85'
  }
  if (backgroundState.configured) {
    return 'border-amber-300/25 bg-amber-300/10 text-amber-100/85'
  }
  return 'border-white/15 bg-white/[0.04] text-white/45'
})
const customBackgroundActive = computed(
  () =>
    backgroundState.configured &&
    backgroundState.selectedName !== null &&
    !backgroundState.fallback,
)
const backgroundCurrentImage = computed(() =>
  customBackgroundActive.value
    ? backgroundState.selectedName ?? ''
    : builtinBackground?.fileName ?? '内置背景',
)
const backgroundCanSave = computed(
  () => backgroundPathDraft.value.trim().length > 0 && !backgroundBusy.value,
)
const backgroundCanRescan = computed(
  () => backgroundState.configured && !backgroundBusy.value,
)
const backgroundCanClear = computed(
  () => backgroundState.configured && !backgroundBusy.value,
)
const backgroundSaveText = computed(() =>
  backgroundState.busy === 'save' ? '保存中' : '保存',
)
const backgroundRescanText = computed(() =>
  backgroundState.busy === 'rescan' ? '扫描中' : '重新扫描',
)
const backgroundClearText = computed(() =>
  backgroundState.busy === 'clear' ? '清除中' : '清除',
)

watch(
  () => backgroundState.directory,
  (directory) => {
    backgroundPathDraft.value = directory ?? ''
  },
  { immediate: true },
)

onMounted(() => {
  degraded.value = isStorageDegraded()
  void checkRelay()
  // 学期目标可能由系统值覆盖，设置页需要当前概览才能显示“当前生效”。
  void refreshYgdk()
  void refreshAuthStatus(true).then(() => {
    if (!authState.deriving) return
    stopDerivationPolling?.()
    stopDerivationPolling = pollWhileDeriving()
  })
  refreshPomodoroNotificationPermission()
  void hydrateBackground()
})

onUnmounted(() => {
  stopDerivationPolling?.()
  stopDerivationPolling = null
})

/** 登录成功后四类数据源自动刷新一次，并开始轮询派生状态。 */
async function handleLogin(values: {
  username: string
  password: string
  captcha: string
}): Promise<void> {
  const ok = await requestLogin(values)
  if (!ok) return

  stopDerivationPolling?.()
  stopDerivationPolling = pollWhileDeriving()

  void refreshCurrent()
  void refreshExams()
  void refreshSpoc()
  void refreshBykc()
  void refreshBykcChosen()
  void refreshYgdk()
}

async function handleRefreshCaptcha(): Promise<void> {
  await preloadAuth()
}

/** 退出登录：清业务缓存，保留待办、快捷方式、番茄钟、背景与显示开关。 */
async function handleLogout(): Promise<void> {
  const ok = await logoutAuth()
  if (!ok) return

  stopDerivationPolling?.()
  stopDerivationPolling = null

  clearScheduleData()
  clearExamsData()
  clearSpocData()
  clearBykcData()
  clearYgdkData()
  clearCache()
  cacheMessage.value = '已退出登录，已清除业务缓存'
  degraded.value = isStorageDegraded()
}

async function handleRetrySource(source: AuthSourceId): Promise<void> {
  await retryAuthSource(source)
}

// 派生结束（含登录后的异步派生）后再刷新一次各数据源，回主页即可看到数据。
watch(
  () => authState.deriving,
  (deriving, previous) => {
    if (!previous || deriving) return
    void refreshCurrent()
    void refreshExams()
    void refreshSpoc()
    void refreshBykc()
    void refreshBykcChosen()
    void refreshYgdk()
  },
)

/** 学期目标 1–100、周限制 1–14；非法值不保存并提示。 */
function saveYgdkTargets(): void {
  const termTarget = Number(ygdkTermDraft.value)
  if (!isValidYgdkTermTarget(termTarget)) {
    ygdkTargetMessage.value = `学期目标需为 ${MIN_YGDK_TERM_TARGET}–${MAX_YGDK_TERM_TARGET} 的整数`
    return
  }

  const weekTarget = Number(ygdkWeekDraft.value)
  if (!isValidYgdkWeekTarget(weekTarget)) {
    ygdkTargetMessage.value = `周限制需为 ${MIN_YGDK_WEEK_TARGET}–${MAX_YGDK_WEEK_TARGET} 的整数`
    return
  }

  const storedTerm = setYgdkTermTarget(termTarget)
  const storedWeek = setYgdkWeekTarget(weekTarget)
  ygdkTargetMessage.value =
    storedTerm && storedWeek
      ? '已保存，主页阳光卡片立即生效'
      : '已保存到本次会话，但本地存储不可用'
}

function clearCaches(): void {
  clearCache()
  clearScheduleData()
  clearExamsData()
  clearSpocData()
  clearBykcData()
  clearYgdkData()
  cacheMessage.value = '已清除全部缓存'
  degraded.value = isStorageDegraded()
}

function saveLead(): void {
  if (leadDraft.value.trim().length === 0) {
    leadMessage.value = `请输入 ${MIN_HIGHLIGHT_LEAD_MINUTES}–${MAX_HIGHLIGHT_LEAD_MINUTES} 的整数`
    return
  }

  const value = Number(leadDraft.value)
  if (!isValidHighlightLeadMinutes(value)) {
    leadMessage.value = `请输入 ${MIN_HIGHLIGHT_LEAD_MINUTES}–${MAX_HIGHLIGHT_LEAD_MINUTES} 的整数`
    return
  }

  const stored = setHighlightLeadMinutes(value)
  leadDraft.value = String(value)
  leadMessage.value = stored
    ? '已保存，高亮边界立即生效'
    : '已保存到本次会话，但本地存储不可用'
}

async function togglePomodoroNotifications(): Promise<void> {
  await setPomodoroNotificationsEnabled(!pomodoroNotificationsEnabled.value)
}

/** 主页卡片开关立即生效并持久化，无保存按钮，见 docs/ui-lowfi.md 设置。 */
function toggleHomeCard(id: HomeCardId): void {
  const stored = setHomeCardVisible(id, !homeCardVisibility[id])
  homeCardMessage.value = stored
    ? '已保存，立即生效'
    : '已保存到本次会话，但本地存储不可用'
}

async function saveBackground(): Promise<void> {
  if (!backgroundCanSave.value) return

  const saved = await saveBackgroundDirectory(backgroundPathDraft.value)
  if (saved) backgroundPathDraft.value = backgroundState.directory ?? ''
}

async function rescanBackgroundFiles(): Promise<void> {
  if (!backgroundCanRescan.value) return

  const scanned = await rescanBackground()
  if (scanned) backgroundPathDraft.value = backgroundState.directory ?? ''
}

async function clearBackground(): Promise<void> {
  if (!backgroundCanClear.value) return
  await clearBackgroundDirectory()
}

function relayStatusText(status: RelayStatus): string {
  switch (status) {
    case 'ok':
      return '已连接'
    case 'error':
      return '无法连接'
    default:
      return '检查中'
  }
}

const buttonClass =
  'rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 backdrop-blur-xl transition hover:border-white/35 hover:bg-white/[0.11] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35'
const dangerButtonClass =
  'rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-4 py-2 text-sm text-amber-100/75 backdrop-blur-xl transition hover:border-amber-200/35 hover:bg-amber-200/[0.1] hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-35'
const fieldClass =
  'w-full rounded-2xl border border-white/20 bg-slate-950/40 text-white/85 outline-none backdrop-blur-xl transition placeholder:text-white/30 focus:border-white/35'
</script>

<template>
  <div class="home-backdrop min-h-screen text-white antialiased">
    <main class="mx-auto w-full max-w-3xl px-8 py-10">
      <header class="route-page-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-wide">设置</h1>
          <p class="mt-1 text-sm text-white/45">登录状态由本地中继加密保存在本机，前端不保存凭据。</p>
        </div>
        <BackHomeLink />
      </header>

      <div class="route-page-body flow-root">
      <p
        v-if="degraded"
        class="mt-4 rounded-2xl border border-amber-200/20 bg-amber-200/[0.07] px-4 py-3 text-xs text-amber-100/75"
      >
        本地存储不可用，缓存仅在本次页面内有效。
      </p>

      <LoginSection
        :authenticated="authState.authenticated"
        :user="authState.user"
        :authenticated-at="authState.authenticatedAt"
        :persisted="authState.persisted"
        :deriving="authState.deriving"
        :loading="authState.loading"
        :error="authState.error"
        :warning="authState.warning"
        :captcha-required="authState.captchaRequired"
        :captcha-image="authState.captchaImage"
        :already-logged-in="authState.alreadyLoggedIn"
        :last-error-code="authState.lastErrorCode"
        :sources="authState.sources"
        @submit="handleLogin"
        @refresh-captcha="handleRefreshCaptcha"
        @logout="handleLogout"
      >
        <SourceStateList
          v-if="authState.authenticated"
          :sources="authState.sources"
          @retry="handleRetrySource"
        />
      </LoginSection>

      <section
        class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div>
          <h2 class="text-base font-medium text-white/90">打卡目标</h2>
          <p class="mt-1 text-xs leading-relaxed text-white/45">
            系统未给出学期目标时使用此值；周限制始终使用此值。
          </p>

          <div class="mt-3 flex flex-wrap items-end gap-3">
            <label class="flex flex-col gap-2">
              <span class="text-xs text-white/45">学期目标</span>
              <input
                v-model="ygdkTermDraft"
                type="number"
                :min="MIN_YGDK_TERM_TARGET"
                :max="MAX_YGDK_TERM_TARGET"
                step="1"
                :class="[fieldClass, 'h-11 w-32 px-4 text-[13px]']"
                aria-label="阳光学期目标"
                @keydown.enter="saveYgdkTargets"
              >
            </label>
            <label class="flex flex-col gap-2">
              <span class="text-xs text-white/45">周限制</span>
              <input
                v-model="ygdkWeekDraft"
                type="number"
                :min="MIN_YGDK_WEEK_TARGET"
                :max="MAX_YGDK_WEEK_TARGET"
                step="1"
                :class="[fieldClass, 'h-11 w-32 px-4 text-[13px]']"
                aria-label="阳光周限制"
                @keydown.enter="saveYgdkTargets"
              >
            </label>
            <button type="button" :class="buttonClass" @click="saveYgdkTargets">保存</button>
          </div>

          <p class="mt-2 text-xs text-white/40">
            当前生效：学期 {{ ygdkEffectiveTermTarget }} 次 / 本周 {{ ygdkEffectiveWeekLimit }} 次
          </p>
          <p v-if="ygdkTargetMessage" class="mt-1 text-xs text-white/55" aria-live="polite">
            {{ ygdkTargetMessage }}
          </p>
        </div>
      </section>

      <section
        class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-medium text-white/90">日程高亮</h2>
            <p class="mt-1 text-xs leading-relaxed text-white/45">
              课程开始前多少分钟进入高亮；0 表示只高亮进行中的课程。
            </p>
          </div>
          <span
            class="shrink-0 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/45"
          >
            默认 {{ DEFAULT_HIGHLIGHT_LEAD_MINUTES }} 分钟
          </span>
        </div>

        <div class="mt-4 flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-2">
            <span class="text-xs text-white/45">提前高亮分钟数</span>
            <input
              v-model="leadDraft"
              type="number"
              :min="MIN_HIGHLIGHT_LEAD_MINUTES"
              :max="MAX_HIGHLIGHT_LEAD_MINUTES"
              step="1"
              :class="[fieldClass, 'h-11 w-40 px-4 text-[13px]']"
              aria-label="提前高亮分钟数"
              @keydown.enter="saveLead"
            >
          </label>
          <button type="button" :class="buttonClass" @click="saveLead">保存</button>
          <span class="pb-2 text-xs text-white/40">
            当前生效：{{ highlightLeadMinutes }} 分钟
          </span>
        </div>

        <p v-if="leadMessage" class="mt-2 text-xs text-white/55" aria-live="polite">
          {{ leadMessage }}
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-white/45">
          <span class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-amber-300"></span>
            即将开始
          </span>
          <span class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-sky-300"></span>
            进行中
          </span>
        </div>
      </section>

      <section
        class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-medium text-white/90">主页卡片</h2>
            <p class="mt-1 text-xs leading-relaxed text-white/45">
              关闭后主页不显示该卡片，并停止请求对应数据源；重新开启后按缓存优先刷新。
            </p>
          </div>
          <span
            class="shrink-0 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/45"
          >
            默认全部开启
          </span>
        </div>

        <div class="mt-2">
          <div
            v-for="option in HOME_CARD_OPTIONS"
            :key="option.id"
            class="flex items-center justify-between gap-4 border-b border-white/10 py-3 last:border-b-0"
          >
            <div class="min-w-0">
              <p class="text-sm text-white/80">{{ option.title }}</p>
              <p class="mt-1 text-xs leading-relaxed text-white/45">{{ option.hint }}</p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="homeCardVisibility[option.id]"
              :aria-label="`${option.title}卡片开关`"
              class="relative h-6 w-11 shrink-0 rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
              :class="
                homeCardVisibility[option.id]
                  ? 'border-sky-300/40 bg-sky-300/25'
                  : 'border-white/20 bg-white/10'
              "
              @click="toggleHomeCard(option.id)"
            >
              <span
                class="absolute top-1 h-4 w-4 rounded-full bg-white transition-all"
                :class="homeCardVisibility[option.id] ? 'left-6' : 'left-0.5'"
              ></span>
            </button>
          </div>
        </div>

        <p v-if="homeCardMessage" class="mt-2 text-xs text-white/55" aria-live="polite">
          {{ homeCardMessage }}
        </p>
      </section>

      <section
        class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-medium text-white/90">背景</h2>
            <p class="mt-1 text-xs leading-relaxed text-white/45">
              从本机目录第一层随机取一张图片，支持 jpg、jpeg、png、webp、gif、bmp、avif；图片不复制进仓库。
            </p>
          </div>
          <span
            class="shrink-0 rounded-full border px-2.5 py-1 text-[11px]"
            :class="backgroundStatusClass"
          >
            {{ backgroundStatusText }}
          </span>
        </div>

        <div class="mt-4">
          <input
            v-model="backgroundPathDraft"
            :class="[fieldClass, 'h-11 px-4 font-mono text-[12px]']"
            placeholder="背景目录绝对路径"
            aria-label="背景目录绝对路径"
            autocomplete="off"
            spellcheck="false"
            @keydown.enter="saveBackground"
          >
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            :class="buttonClass"
            :disabled="!backgroundCanSave"
            @click="saveBackground"
          >
            {{ backgroundSaveText }}
          </button>
          <button
            type="button"
            :class="buttonClass"
            :disabled="!backgroundCanRescan"
            @click="rescanBackgroundFiles"
          >
            {{ backgroundRescanText }}
          </button>
          <button
            type="button"
            :class="dangerButtonClass"
            :disabled="!backgroundCanClear"
            @click="clearBackground"
          >
            {{ backgroundClearText }}
          </button>
        </div>

        <div class="mt-3 space-y-1">
          <p class="flex min-w-0 items-center gap-1 text-xs text-white/40">
            <span class="shrink-0">当前目录：</span>
            <span
              class="truncate font-mono text-white/60"
              :title="backgroundState.directory ?? ''"
            >
              {{ backgroundState.directory ?? '未配置，使用内置背景' }}
            </span>
          </p>
          <p class="flex min-w-0 items-center gap-1 text-xs text-white/40">
            <span class="shrink-0">当前背景：</span>
            <span
              v-if="customBackgroundActive"
              class="truncate font-mono text-white/60"
              :title="backgroundCurrentImage"
            >
              {{ backgroundCurrentImage }}
            </span>
            <span v-else class="min-w-0 truncate text-white/60" :title="backgroundCurrentImage">
              内置背景<template v-if="builtinBackground">（图源<a
                :href="builtinBackground.sourceUrl ?? undefined"
                class="text-white/80 underline decoration-white/25 underline-offset-2 transition hover:text-white"
                target="_blank"
                rel="noreferrer noopener"
              >{{ builtinBackground.sourceName }}</a>，作者{{ builtinBackground.author }}）</template><template v-else>（无可用图片）</template>
            </span>
          </p>
        </div>

        <p
          v-if="backgroundState.warning"
          class="mt-2 text-xs leading-relaxed text-amber-100/75"
          aria-live="polite"
        >
          {{ backgroundState.warning }}
        </p>
        <p
          v-if="backgroundState.message"
          class="mt-2 text-xs"
          :class="
            backgroundState.messageKind === 'error'
              ? 'text-amber-100/75'
              : 'text-white/55'
          "
          aria-live="polite"
        >
          {{ backgroundState.message }}
        </p>
      </section>

      <section
        class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <h2 class="text-base font-medium text-white/90">操作</h2>

        <div class="mt-4 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div class="min-w-0">
            <p class="text-sm text-white/80">番茄钟桌面通知</p>
            <p class="mt-1 text-xs leading-relaxed text-white/45">
              阶段结束前 1 分钟与结束时发送；首次开启或首次开始专注时请求通知权限。
            </p>
            <p class="mt-1 text-[11px] text-white/35">
              通知权限：{{ pomodoroPermissionText }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/60 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35"
              :disabled="!pomodoroNotificationsEnabled || pomodoroNotificationBusy"
              @click="testPomodoroNotification"
            >
              测试通知
            </button>
            <button
              type="button"
              role="switch"
              :aria-checked="pomodoroNotificationsEnabled"
              :aria-label="
                pomodoroNotificationsEnabled ? '关闭番茄钟桌面通知' : '开启番茄钟桌面通知'
              "
              class="relative h-6 w-11 shrink-0 rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-50"
              :class="
                pomodoroNotificationsEnabled
                  ? 'border-sky-300/40 bg-sky-300/25'
                  : 'border-white/20 bg-white/10'
              "
              :disabled="pomodoroNotificationBusy"
              @click="togglePomodoroNotifications"
            >
              <span
                class="absolute top-1 h-4 w-4 rounded-full bg-white transition-all"
                :class="pomodoroNotificationsEnabled ? 'left-6' : 'left-0.5'"
              ></span>
            </button>
          </div>
        </div>

        <p
          v-if="pomodoroNotificationMessage"
          class="mt-2 text-xs text-white/55"
          aria-live="polite"
        >
          {{ pomodoroNotificationMessage }}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" :class="dangerButtonClass" @click="clearCaches">
            清除缓存
          </button>
        </div>
        <p v-if="cacheMessage" class="mt-2 text-xs text-white/45" aria-live="polite">
          {{ cacheMessage }}
        </p>
      </section>

      <section
        class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-base font-medium text-white/90">本地中继</h2>
            <p class="mt-1 text-xs text-white/45">{{ relayMessage }}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm" :class="relayClass">{{ relayText }}</span>
            <button type="button" :class="buttonClass" @click="checkRelay">检查</button>
          </div>
        </div>
      </section>
      </div>
    </main>
  </div>
</template>

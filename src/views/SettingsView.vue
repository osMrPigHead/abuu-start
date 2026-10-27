<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BackHomeLink from '@/components/BackHomeLink.vue'
import {
  useCredentials,
  type CredentialStatus,
  type RelayStatus,
} from '@/composables/useCredentials'
import { useBackground } from '@/composables/useBackground'
import { useBykc } from '@/composables/useBykc'
import { useExams } from '@/composables/useExams'
import {
  HOME_CARD_OPTIONS,
  useHomeCards,
  type HomeCardId,
} from '@/composables/useHomeCards'
import { useSchedule } from '@/composables/useSchedule'
import { usePomodoro } from '@/composables/usePomodoro'
import { useSpoc } from '@/composables/useSpoc'
import { useYgdk } from '@/composables/useYgdk'
import { useYgdkSettings } from '@/composables/useYgdkSettings'
import {
  isValidHighlightLeadMinutes,
  useScheduleSettings,
} from '@/composables/useScheduleSettings'
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

const {
  state,
  hasByxt,
  maskedByxtCookie,
  hasSpoc,
  maskedSpocToken,
  hasBykc,
  maskedBykcToken,
  hasYgdk,
  maskedYgdkToken,
  saveByxtCookie,
  validateByxt,
  clearByxtCookie,
  saveSpocCredentials,
  validateSpoc,
  clearSpocCredentials,
  saveBykcToken,
  validateBykc,
  clearBykcCredentials,
  saveYgdkCredentials,
  validateYgdk,
  clearYgdkCredentials,
  clearAllCredentials,
  checkRelay,
} = useCredentials()
const { clearScheduleData } = useSchedule()
const { clearExamsData } = useExams()
const { clearSpocData } = useSpoc()
const { clearBykcData } = useBykc()
const { state: ygdkState, refresh: refreshYgdk, clearYgdkData } = useYgdk()
const { highlightLeadMinutes, setHighlightLeadMinutes } = useScheduleSettings()
const { visibility: homeCardVisibility, setVisible: setHomeCardVisible } = useHomeCards()
const {
  state: backgroundState,
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

const editingByxt = ref(false)
const byxtDraft = ref('')
const editingSpoc = ref(false)
const spocTokenDraft = ref('')
const spocRoleDraft = ref('')
const editingYgdk = ref(false)
const ygdkUidDraft = ref('')
const ygdkTokenDraft = ref('')
const editingBykc = ref(false)
const bykcDraft = ref('')
const cacheMessage = ref('')
const degraded = ref(false)
const leadDraft = ref(String(highlightLeadMinutes.value))
const leadMessage = ref('')
const homeCardMessage = ref('')
const backgroundPathDraft = ref('')
const ygdkTermDraft = ref(String(ygdkUserTermTarget.value))
const ygdkWeekDraft = ref(String(ygdkUserWeekTarget.value))
const ygdkTargetMessage = ref('')

const showInput = computed(() => !hasByxt.value || editingByxt.value)
const showSpocInput = computed(() => !hasSpoc.value || editingSpoc.value)
const byxtStatusText = computed(() => credentialStatusText(state.byxtStatus))
const byxtStatusClass = computed(() => credentialStatusClass(state.byxtStatus))
const spocStatusText = computed(() => credentialStatusText(state.spocStatus))
const spocStatusClass = computed(() => credentialStatusClass(state.spocStatus))
const maskedSpocRole = computed(() => maskSpocRole(state.spocRoleCode))
const ygdkStatusText = computed(() => credentialStatusText(state.ygdkStatus))
const ygdkStatusClass = computed(() => credentialStatusClass(state.ygdkStatus))
const showYgdkInput = computed(() => !hasYgdk.value || editingYgdk.value)
const bykcStatusText = computed(() => credentialStatusText(state.bykcStatus))
const bykcStatusClass = computed(() => credentialStatusClass(state.bykcStatus))
const showBykcInput = computed(() => !hasBykc.value || editingBykc.value)
/** 学期目标优先系统值；周限制始终用设置值，与主页卡片口径一致。 */
const ygdkEffectiveTermTarget = computed(() =>
  resolveYgdkTermTarget(ygdkState.overview?.termTarget ?? 0, ygdkUserTermTarget.value),
)
const ygdkEffectiveWeekLimit = computed(() => resolveYgdkWeekLimit(ygdkUserWeekTarget.value))
const relayText = computed(() => relayStatusText(state.relayStatus))
const relayClass = computed(() =>
  state.relayStatus === 'ok'
    ? 'text-emerald-200/80'
    : state.relayStatus === 'error'
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
const backgroundCurrentImage = computed(() =>
  backgroundState.selectedName !== null && !backgroundState.fallback
    ? backgroundState.selectedName
    : '内置背景',
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
  refreshPomodoroNotificationPermission()
  void hydrateBackground()
})

async function saveCookie(): Promise<void> {
  const saved = await saveByxtCookie(byxtDraft.value)
  if (!saved) return

  byxtDraft.value = ''
  editingByxt.value = false
}

function startReplace(): void {
  byxtDraft.value = ''
  editingByxt.value = true
}

function cancelReplace(): void {
  byxtDraft.value = ''
  editingByxt.value = false
}

function clearCookie(): void {
  clearByxtCookie()
  byxtDraft.value = ''
  editingByxt.value = false
}

function clearAll(): void {
  clearAllCredentials()
  byxtDraft.value = ''
  editingByxt.value = false
  spocTokenDraft.value = ''
  spocRoleDraft.value = ''
  editingSpoc.value = false
  bykcDraft.value = ''
  editingBykc.value = false
  ygdkUidDraft.value = ''
  ygdkTokenDraft.value = ''
  editingYgdk.value = false
  cacheMessage.value = ''
}

async function saveSpoc(): Promise<void> {
  const saved = await saveSpocCredentials(spocTokenDraft.value, spocRoleDraft.value)
  if (!saved) return

  spocTokenDraft.value = ''
  spocRoleDraft.value = ''
  editingSpoc.value = false
}

function startSpocReplace(): void {
  spocTokenDraft.value = ''
  spocRoleDraft.value = ''
  editingSpoc.value = true
}

function cancelSpocReplace(): void {
  spocTokenDraft.value = ''
  spocRoleDraft.value = ''
  editingSpoc.value = false
}

function clearSpoc(): void {
  clearSpocCredentials()
  spocTokenDraft.value = ''
  spocRoleDraft.value = ''
  editingSpoc.value = false
}

function maskSpocRole(value: string): string {
  return value.length > 0 ? '••••' : ''
}

async function saveBykc(): Promise<void> {
  const saved = await saveBykcToken(bykcDraft.value)
  if (!saved) return

  bykcDraft.value = ''
  editingBykc.value = false
}

function startBykcReplace(): void {
  bykcDraft.value = ''
  editingBykc.value = true
}

function cancelBykcReplace(): void {
  bykcDraft.value = ''
  editingBykc.value = false
}

function clearBykc(): void {
  clearBykcCredentials()
  bykcDraft.value = ''
  editingBykc.value = false
}

async function saveYgdk(): Promise<void> {
  const saved = await saveYgdkCredentials(ygdkUidDraft.value, ygdkTokenDraft.value)
  if (!saved) return

  ygdkUidDraft.value = ''
  ygdkTokenDraft.value = ''
  editingYgdk.value = false
}

function startYgdkReplace(): void {
  ygdkUidDraft.value = ''
  ygdkTokenDraft.value = ''
  editingYgdk.value = true
}

function cancelYgdkReplace(): void {
  ygdkUidDraft.value = ''
  ygdkTokenDraft.value = ''
  editingYgdk.value = false
}

function clearYgdk(): void {
  clearYgdkCredentials()
  ygdkUidDraft.value = ''
  ygdkTokenDraft.value = ''
  editingYgdk.value = false
}

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

function credentialStatusText(status: CredentialStatus): string {
  switch (status) {
    case 'configured':
      return '已配置'
    case 'checking':
      return '校验中'
    case 'expired':
      return '已失效'
    default:
      return '未配置'
  }
}

function credentialStatusClass(status: CredentialStatus): string {
  switch (status) {
    case 'configured':
      return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100/85'
    case 'checking':
      return 'border-sky-300/25 bg-sky-300/10 text-sky-100/85'
    case 'expired':
      return 'border-amber-300/25 bg-amber-300/10 text-amber-100/85'
    default:
      return 'border-white/15 bg-white/[0.04] text-white/45'
  }
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
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-wide">设置</h1>
          <p class="mt-1 text-sm text-white/45">凭据只保存在本机，仅随本地中继请求发送。</p>
        </div>
        <BackHomeLink />
      </header>

      <p
        v-if="degraded"
        class="mt-4 rounded-2xl border border-amber-200/20 bg-amber-200/[0.07] px-4 py-3 text-xs text-amber-100/75"
      >
        本地存储不可用，凭据与缓存仅在本次页面内有效。
      </p>

      <section
        class="mt-6 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-medium text-white/90">本研教育管理系统 Cookie</h2>
            <p class="mt-1 text-xs leading-relaxed text-white/45">
              在浏览器开发者工具 → Network → 任一 byxt 请求 → Request Headers 中复制 Cookie。
            </p>
          </div>
          <span
            class="shrink-0 rounded-full border px-2.5 py-1 text-[11px]"
            :class="byxtStatusClass"
          >
            {{ byxtStatusText }}
          </span>
        </div>

        <div class="mt-4">
          <textarea
            v-if="showInput"
            v-model="byxtDraft"
            :class="[fieldClass, 'h-28 resize-y px-4 py-3 font-mono text-[12px] leading-relaxed']"
            placeholder="Cookie: name=value; name2=value2"
            aria-label="本研教育管理系统 Cookie"
            spellcheck="false"
          ></textarea>
          <div
            v-else
            :class="[fieldClass, 'flex h-12 items-center px-4 font-mono text-[13px] tracking-widest text-white/55']"
          >
            {{ maskedByxtCookie }}
          </div>        </div>

        <p
          v-if="state.byxtMessage"
          class="mt-2 text-xs text-white/55"
          aria-live="polite"
        >
          {{ state.byxtMessage }}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <template v-if="showInput">
            <button type="button" :class="buttonClass" @click="saveCookie">保存</button>
            <button
              v-if="hasByxt"
              type="button"
              :class="buttonClass"
              @click="cancelReplace"
            >
              取消
            </button>
          </template>
          <template v-else>
            <button type="button" :class="buttonClass" @click="startReplace">替换</button>
            <button type="button" :class="buttonClass" @click="validateByxt">校验</button>
          </template>
          <button
            v-if="hasByxt"
            type="button"
            :class="dangerButtonClass"
            @click="clearCookie"
          >
            清除
          </button>
        </div>
      </section>

      <section
        class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-medium text-white/90">SPOC 凭据</h2>
            <p class="mt-1 text-xs leading-relaxed text-white/45">
              Token 与 RoleCode 来自开发者工具 Network 中任一 SPOC 请求的 Request Headers。
            </p>
          </div>
          <span
            class="shrink-0 rounded-full border px-2.5 py-1 text-[11px]"
            :class="spocStatusClass"
          >
            {{ spocStatusText }}
          </span>
        </div>

        <div v-if="showSpocInput" class="mt-4 grid gap-3">
          <label class="flex flex-col gap-2">
            <span class="text-xs text-white/45">Token</span>
            <input
              v-model="spocTokenDraft"
              :class="[fieldClass, 'h-11 px-4 text-[13px]']"
              placeholder="Inco-…"
              aria-label="SPOC Token"
              autocomplete="off"
              spellcheck="false"
            >
          </label>
          <label class="flex flex-col gap-2">
            <span class="text-xs text-white/45">RoleCode</span>
            <input
              v-model="spocRoleDraft"
              :class="[fieldClass, 'h-11 px-4 text-[13px]']"
              placeholder="例如 01"
              aria-label="SPOC RoleCode"
              autocomplete="off"
              spellcheck="false"
            >
          </label>
        </div>

        <div v-else class="mt-4 grid gap-3">
          <div
            :class="[fieldClass, 'flex h-11 items-center gap-3 px-4 text-[13px]']"
          >
            <span class="shrink-0 text-white/35">Token</span>
            <span class="font-mono tracking-widest text-white/55">{{ maskedSpocToken }}</span>
          </div>
          <div
            :class="[fieldClass, 'flex h-11 items-center gap-3 px-4 text-[13px]']"
          >
            <span class="shrink-0 text-white/35">RoleCode</span>
            <span class="font-mono tracking-widest text-white/55">{{ maskedSpocRole }}</span>
          </div>
        </div>

        <p
          v-if="state.spocMessage"
          class="mt-2 text-xs text-white/55"
          aria-live="polite"
        >
          {{ state.spocMessage }}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <template v-if="showSpocInput">
            <button type="button" :class="buttonClass" @click="saveSpoc">保存</button>
            <button
              v-if="hasSpoc"
              type="button"
              :class="buttonClass"
              @click="cancelSpocReplace"
            >
              取消
            </button>
          </template>
          <template v-else>
            <button type="button" :class="buttonClass" @click="startSpocReplace">替换</button>
            <button type="button" :class="buttonClass" @click="validateSpoc">校验</button>
          </template>
          <button
            v-if="hasSpoc"
            type="button"
            :class="dangerButtonClass"
            @click="clearSpoc"
          >
            清除
          </button>
        </div>
      </section>

      <section
        class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-medium text-white/90">博雅课程 auth_token</h2>
            <p class="mt-1 text-xs leading-relaxed text-white/45">
              auth_token 来自开发者工具 Network 中任一 sscv 请求的 Request Headers（auth_token 与 authtoken 同值）。
            </p>
          </div>
          <span
            class="shrink-0 rounded-full border px-2.5 py-1 text-[11px]"
            :class="bykcStatusClass"
          >
            {{ bykcStatusText }}
          </span>
        </div>

        <div v-if="showBykcInput" class="mt-4">
          <label class="flex flex-col gap-2">
            <span class="text-xs text-white/45">auth_token</span>
            <input
              v-model="bykcDraft"
              :class="[fieldClass, 'h-11 px-4 font-mono text-[12px]']"
              placeholder="auth_token"
              aria-label="博雅课程 auth_token"
              autocomplete="off"
              spellcheck="false"
            >
          </label>
        </div>

        <div v-else class="mt-4">
          <div :class="[fieldClass, 'flex h-11 items-center gap-3 px-4 text-[13px]']">
            <span class="shrink-0 text-white/35">auth_token</span>
            <span class="font-mono tracking-widest text-white/55">{{ maskedBykcToken }}</span>
          </div>
        </div>

        <p
          v-if="state.bykcMessage"
          class="mt-2 text-xs text-white/55"
          aria-live="polite"
        >
          {{ state.bykcMessage }}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <template v-if="showBykcInput">
            <button type="button" :class="buttonClass" @click="saveBykc">保存</button>
            <button
              v-if="hasBykc"
              type="button"
              :class="buttonClass"
              @click="cancelBykcReplace"
            >
              取消
            </button>
          </template>
          <template v-else>
            <button type="button" :class="buttonClass" @click="startBykcReplace">替换</button>
            <button type="button" :class="buttonClass" @click="validateBykc">校验</button>
          </template>
          <button
            v-if="hasBykc"
            type="button"
            :class="dangerButtonClass"
            @click="clearBykc"
          >
            清除
          </button>
        </div>
      </section>

      <section
        class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-medium text-white/90">阳光打卡</h2>
            <p class="mt-1 text-xs leading-relaxed text-white/45">
              UID 与 token 来自开发者工具 Network 中任一 ygdk 请求的 Form Data。
            </p>
          </div>
          <span
            class="shrink-0 rounded-full border px-2.5 py-1 text-[11px]"
            :class="ygdkStatusClass"
          >
            {{ ygdkStatusText }}
          </span>
        </div>

        <div v-if="showYgdkInput" class="mt-4 grid gap-3">
          <label class="flex flex-col gap-2">
            <span class="text-xs text-white/45">UID</span>
            <input
              v-model="ygdkUidDraft"
              :class="[fieldClass, 'h-11 px-4 text-[13px]']"
              placeholder="例如 20231234"
              inputmode="numeric"
              aria-label="阳光打卡 UID"
              autocomplete="off"
              spellcheck="false"
            >
          </label>
          <label class="flex flex-col gap-2">
            <span class="text-xs text-white/45">Token</span>
            <input
              v-model="ygdkTokenDraft"
              :class="[fieldClass, 'h-11 px-4 text-[13px]']"
              placeholder="token"
              aria-label="阳光打卡 token"
              autocomplete="off"
              spellcheck="false"
            >
          </label>
        </div>

        <div v-else class="mt-4 grid gap-3">
          <div :class="[fieldClass, 'flex h-11 items-center gap-3 px-4 text-[13px]']">
            <span class="shrink-0 text-white/35">UID</span>
            <span class="font-mono text-white/55">{{ state.ygdkUid }}</span>
          </div>
          <div :class="[fieldClass, 'flex h-11 items-center gap-3 px-4 text-[13px]']">
            <span class="shrink-0 text-white/35">Token</span>
            <span class="font-mono tracking-widest text-white/55">{{ maskedYgdkToken }}</span>
          </div>
        </div>

        <p
          v-if="state.ygdkMessage"
          class="mt-2 text-xs text-white/55"
          aria-live="polite"
        >
          {{ state.ygdkMessage }}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <template v-if="showYgdkInput">
            <button type="button" :class="buttonClass" @click="saveYgdk">保存</button>
            <button
              v-if="hasYgdk"
              type="button"
              :class="buttonClass"
              @click="cancelYgdkReplace"
            >
              取消
            </button>
          </template>
          <template v-else>
            <button type="button" :class="buttonClass" @click="startYgdkReplace">替换</button>
            <button type="button" :class="buttonClass" @click="validateYgdk">校验</button>
          </template>
          <button
            v-if="hasYgdk"
            type="button"
            :class="dangerButtonClass"
            @click="clearYgdk"
          >
            清除
          </button>
        </div>

        <div class="mt-5 border-t border-white/10 pt-4">
          <h3 class="text-sm font-medium text-white/80">打卡目标</h3>
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
            placeholder="D:\Pictures\wallpapers"
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
            <span class="truncate font-mono text-white/60" :title="backgroundCurrentImage">
              {{ backgroundCurrentImage }}
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
          <button type="button" :class="dangerButtonClass" @click="clearAll">
            清除全部凭据
          </button>
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
            <p class="mt-1 text-xs text-white/45">{{ state.relayMessage }}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm" :class="relayClass">{{ relayText }}</span>
            <button type="button" :class="buttonClass" @click="checkRelay">检查</button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

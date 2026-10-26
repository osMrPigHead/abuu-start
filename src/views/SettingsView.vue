<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  useCredentials,
  type CredentialStatus,
  type RelayStatus,
} from '@/composables/useCredentials'
import { useExams } from '@/composables/useExams'
import { useSchedule } from '@/composables/useSchedule'
import {
  isValidHighlightLeadMinutes,
  useScheduleSettings,
} from '@/composables/useScheduleSettings'
import {
  DEFAULT_HIGHLIGHT_LEAD_MINUTES,
  MAX_HIGHLIGHT_LEAD_MINUTES,
  MIN_HIGHLIGHT_LEAD_MINUTES,
} from '@/utils/schedule'
import { clearCache, isStorageDegraded } from '@/utils/storage'

const {
  state,
  hasByxt,
  maskedByxtCookie,
  saveByxtCookie,
  validateByxt,
  clearByxtCookie,
  clearAllCredentials,
  checkRelay,
} = useCredentials()
const { clearScheduleData } = useSchedule()
const { clearExamsData } = useExams()
const { highlightLeadMinutes, setHighlightLeadMinutes } = useScheduleSettings()

const editingByxt = ref(false)
const byxtDraft = ref('')
const cacheMessage = ref('')
const degraded = ref(false)
const leadDraft = ref(String(highlightLeadMinutes.value))
const leadMessage = ref('')

const showInput = computed(() => !hasByxt.value || editingByxt.value)
const byxtStatusText = computed(() => credentialStatusText(state.byxtStatus))
const byxtStatusClass = computed(() => credentialStatusClass(state.byxtStatus))
const relayText = computed(() => relayStatusText(state.relayStatus))
const relayClass = computed(() =>
  state.relayStatus === 'ok'
    ? 'text-emerald-200/80'
    : state.relayStatus === 'error'
      ? 'text-amber-200/80'
      : 'text-white/45',
)

onMounted(() => {
  degraded.value = isStorageDegraded()
  void checkRelay()
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
  cacheMessage.value = ''
}

function clearCaches(): void {
  clearCache()
  clearScheduleData()
  clearExamsData()
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
      <header>
        <h1 class="text-2xl font-semibold tracking-wide">设置</h1>
        <p class="mt-1 text-sm text-white/45">凭据只保存在本机，仅随本地中继请求发送。</p>
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
            class="shrink-0 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/45"
          >
            待接入
          </span>
        </div>

        <div class="mt-4 grid gap-3">
          <input
            :class="[fieldClass, 'h-11 px-4 text-[13px]']"
            placeholder="Token"
            aria-label="SPOC Token"
            disabled
          >
          <input
            :class="[fieldClass, 'h-11 px-4 text-[13px]']"
            placeholder="RoleCode"
            aria-label="SPOC RoleCode"
            disabled
          >
        </div>

        <p class="mt-3 text-xs text-white/35">SPOC 凭据保存与校验将在后续任务接入。</p>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" :class="buttonClass" disabled>保存</button>
          <button type="button" :class="buttonClass" disabled>校验</button>
          <button type="button" :class="buttonClass" disabled>清除</button>
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
        <h2 class="text-base font-medium text-white/90">操作</h2>
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

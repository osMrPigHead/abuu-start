<script setup lang="ts">
/** 设置页统一登录区；props 输入、emits 输出，不直接请求或读写存储。 */
import { computed, ref, watch } from 'vue'
import { AUTH_SOURCE_ORDER } from '@/composables/useAuth'
import type { AuthSources, AuthUser } from '@/types'
import { formatStamp } from '@/utils/date'

const props = defineProps<{
  authenticated: boolean
  user: AuthUser | null
  authenticatedAt: string | null
  persisted: boolean
  deriving: boolean
  loading: boolean
  error: string
  warning: string
  captchaRequired: boolean
  captchaImage: string | null
  alreadyLoggedIn: boolean
  lastErrorCode: string
  sources: AuthSources
}>()

const emit = defineEmits<{
  submit: [values: { username: string; password: string; captcha: string }]
  'refresh-captcha': []
  logout: []
}>()

const username = ref('')
const password = ref('')
const captcha = ref('')

// 账号或密码错误时清空密码、保留学号；验证码错误时清空验证码、保留其余输入。
watch(
  () => props.lastErrorCode,
  (code) => {
    if (code === 'INVALID_CREDENTIALS' || code === 'PASSWORD_EXPIRED') password.value = ''
    if (code === 'CAPTCHA_INVALID' || code === 'CAPTCHA_REQUIRED') captcha.value = ''
  },
)

watch(
  () => props.captchaImage,
  () => {
    captcha.value = ''
  },
)

watch(
  () => props.authenticated,
  (authenticated) => {
    if (!authenticated) return
    username.value = ''
    password.value = ''
    captcha.value = ''
  },
)

const sessionStatus = computed(() => {
  if (!props.authenticated) return '未登录'
  if (AUTH_SOURCE_ORDER.some((source) => props.sources[source].status === 'expired')) {
    return '已失效'
  }
  if (props.deriving) return '派生中'
  if (AUTH_SOURCE_ORDER.some((source) => props.sources[source].status === 'failed')) {
    return '部分失败'
  }
  return '已登录'
})

const sessionStatusClass = computed(() => {
  switch (sessionStatus.value) {
    case '已登录':
      return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100/85'
    case '派生中':
      return 'border-sky-300/25 bg-sky-300/10 text-sky-100/85'
    case '部分失败':
    case '已失效':
      return 'border-amber-300/25 bg-amber-300/10 text-amber-100/85'
    default:
      return 'border-white/15 bg-white/[0.04] text-white/45'
  }
})

const canSubmit = computed(() => {
  if (props.loading || props.authenticated) return false
  if (props.alreadyLoggedIn) return true
  if (username.value.trim().length === 0 || password.value.length === 0) return false
  if (props.captchaRequired && captcha.value.trim().length === 0) return false
  return true
})

const loginTime = computed(() => formatStamp(props.authenticatedAt))

function onSubmit(): void {
  if (!canSubmit.value) return
  emit('submit', {
    username: username.value,
    password: password.value,
    captcha: captcha.value,
  })
}

const buttonClass =
  'rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-sm text-white/80 backdrop-blur-xl transition hover:border-white/35 hover:bg-white/[0.11] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35'
const dangerButtonClass =
  'rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-4 py-2 text-sm text-amber-100/75 backdrop-blur-xl transition hover:border-amber-200/35 hover:bg-amber-200/[0.1] hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-35'
const fieldClass =
  'w-full rounded-2xl border border-white/20 bg-slate-950/40 text-white/85 outline-none backdrop-blur-xl transition placeholder:text-white/30 focus:border-white/35'
</script>

<template>
  <section
    class="mt-6 rounded-3xl border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
  >
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2 class="text-base font-medium text-white/90">统一登录</h2>
        <p class="mt-1 text-xs leading-relaxed text-white/45">
          一次学号与密码登录，由本地中继完成学校统一认证并派生四类数据源凭据；凭据加密保存在本机，前端不保存。
        </p>
      </div>
      <span
        class="shrink-0 rounded-full border px-2.5 py-1 text-[11px]"
        :class="sessionStatusClass"
      >
        {{ sessionStatus }}
      </span>
    </div>

    <template v-if="!authenticated">
      <div class="mt-4 grid gap-3">
        <label class="flex flex-col gap-2">
          <span class="text-xs text-white/45">学号</span>
          <input
            v-model="username"
            :class="[fieldClass, 'h-11 px-4 text-[13px]']"
            placeholder="2418xxxx"
            aria-label="学号"
            autocomplete="username"
            spellcheck="false"
            @keydown.enter="onSubmit"
          >
        </label>

        <label class="flex flex-col gap-2">
          <span class="text-xs text-white/45">密码</span>
          <input
            v-model="password"
            type="password"
            :class="[fieldClass, 'h-11 px-4 text-[13px]']"
            placeholder="统一认证密码"
            aria-label="密码"
            autocomplete="current-password"
            @keydown.enter="onSubmit"
          >
        </label>

        <div v-if="captchaRequired" class="flex items-end gap-3">
          <div
            class="flex h-11 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-slate-950/40"
          >
            <img
              v-if="captchaImage"
              :src="captchaImage"
              alt="验证码"
              class="h-full w-full object-contain"
            >
            <span v-else class="px-2 text-center text-[11px] text-white/40">
              验证码加载失败
            </span>
          </div>
          <label class="flex min-w-0 flex-1 flex-col gap-2">
            <span class="text-xs text-white/45">验证码</span>
            <input
              v-model="captcha"
              :class="[fieldClass, 'h-11 px-4 text-[13px]']"
              placeholder="验证码"
              aria-label="验证码"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter="onSubmit"
            >
          </label>
          <button
            type="button"
            :class="[buttonClass, 'h-11 shrink-0']"
            :disabled="loading"
            @click="emit('refresh-captcha')"
          >
            刷新验证码
          </button>
        </div>
      </div>

      <p v-if="alreadyLoggedIn" class="mt-2 text-xs text-white/55">
        统一认证会话仍有效，可直接登录。
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          :class="buttonClass"
          :disabled="!canSubmit"
          @click="onSubmit"
        >
          {{ loading ? '登录中' : '登录' }}
        </button>
      </div>

      <p v-if="error" class="mt-2 text-xs text-amber-100/80" aria-live="polite">
        {{ error }}
      </p>
      <p v-if="warning" class="mt-2 text-xs text-amber-100/75" aria-live="polite">
        {{ warning }}
      </p>
    </template>

    <template v-else>
      <div class="mt-4">
        <p class="text-lg font-medium text-white/90">{{ user?.name || '已登录' }}</p>
        <p class="mt-1 text-xs text-white/45">
          学号 {{ user?.schoolid || '—' }} · 登录于 {{ loginTime || '—' }}
        </p>
        <p v-if="!persisted" class="mt-1 text-[11px] text-amber-100/75">
          本次运行内有效：登录状态无法保存到本机。
        </p>
        <p v-if="error" class="mt-2 text-xs text-amber-100/80" aria-live="polite">
          {{ error }}
        </p>
        <p v-if="warning" class="mt-2 text-xs text-amber-100/75" aria-live="polite">
          {{ warning }}
        </p>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          :class="dangerButtonClass"
          :disabled="loading"
          @click="emit('logout')"
        >
          {{ loading ? '退出中' : '退出登录' }}
        </button>
      </div>

      <slot></slot>
    </template>
  </section>
</template>

/** 凭据读取、保存、规范化、状态与校验，见 docs/trd.md 7.1。 */
import { computed, reactive } from 'vue'
import { ApiError } from '@/api/client'
import { fetchByxtStatus } from '@/api/byxt'
import { fetchRelayHealth } from '@/api/relay'
import { maskSecret, normalizeByxtCookie } from '@/utils/credentials'
import { clearCredentials, readCredentials, writeCredentials } from '@/utils/storage'

export type CredentialStatus = 'unconfigured' | 'configured' | 'checking' | 'expired'
export type RelayStatus = 'checking' | 'ok' | 'error'

const INVALID_COOKIE_MESSAGE =
  '没有识别到有效的 Cookie（应形如 name=value; name2=value2）'

const state = reactive({
  byxtCookie: '',
  byxtStatus: 'unconfigured' as CredentialStatus,
  byxtMessage: '',
  spocToken: '',
  spocRoleCode: '',
  relayStatus: 'checking' as RelayStatus,
  relayMessage: '',
  hydrated: false,
})

const hasByxt = computed(() => state.byxtCookie.length > 0)
const maskedByxtCookie = computed(() => maskSecret(state.byxtCookie))

export function useCredentials() {
  hydrate()

  function hydrate(): void {
    if (state.hydrated) return
    state.hydrated = true

    const stored = readCredentials()
    state.byxtCookie = stored.byxtCookie
    state.spocToken = stored.spocToken
    state.spocRoleCode = stored.spocRoleCode
    state.byxtStatus = stored.byxtCookie.length > 0 ? 'configured' : 'unconfigured'
  }

  async function saveByxtCookie(input: string): Promise<boolean> {
    hydrate()
    const normalized = normalizeByxtCookie(input)
    if (!normalized) {
      state.byxtMessage = INVALID_COOKIE_MESSAGE
      return false
    }

    const stored = readCredentials()
    writeCredentials({
      byxtCookie: normalized,
      spocToken: stored.spocToken,
      spocRoleCode: stored.spocRoleCode,
    })
    state.byxtCookie = normalized
    state.byxtStatus = 'configured'
    state.byxtMessage = ''
    await validateByxt()
    return true
  }

  async function validateByxt(): Promise<void> {
    hydrate()
    if (state.byxtCookie.length === 0) {
      state.byxtStatus = 'unconfigured'
      state.byxtMessage = ''
      return
    }

    state.byxtStatus = 'checking'
    state.byxtMessage = '正在校验…'

    try {
      await fetchByxtStatus()
      state.byxtStatus = 'configured'
      state.byxtMessage = '校验通过'
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'AUTH_EXPIRED' || error.code === 'NO_CREDENTIAL')) {
        state.byxtStatus = 'expired'
        state.byxtMessage = '登录状态已失效，请重新获取 Cookie'
        return
      }

      state.byxtStatus = 'configured'
      state.byxtMessage =
        error instanceof ApiError
          ? error.message
          : '校验失败，请确认本地中继与网络状态'
    }
  }

  function clearByxtCookie(): void {
    hydrate()
    const stored = readCredentials()
    writeCredentials({
      byxtCookie: '',
      spocToken: stored.spocToken,
      spocRoleCode: stored.spocRoleCode,
    })
    state.byxtCookie = ''
    state.byxtStatus = 'unconfigured'
    state.byxtMessage = '已清除本研教育管理系统 Cookie'
  }

  function clearAllCredentials(): void {
    clearCredentials()
    state.byxtCookie = ''
    state.spocToken = ''
    state.spocRoleCode = ''
    state.byxtStatus = 'unconfigured'
    state.byxtMessage = '已清除全部凭据'
  }

  async function checkRelay(): Promise<void> {
    state.relayStatus = 'checking'
    state.relayMessage = ''

    try {
      await fetchRelayHealth()
      state.relayStatus = 'ok'
      state.relayMessage = '本地中继运行中'
    } catch (error) {
      state.relayStatus = 'error'
      state.relayMessage = error instanceof ApiError ? error.message : '无法连接本地中继'
    }
  }

  return {
    state,
    hasByxt,
    maskedByxtCookie,
    hydrate,
    saveByxtCookie,
    validateByxt,
    clearByxtCookie,
    clearAllCredentials,
    checkRelay,
  }
}

/** 供课表请求在 401 时同步设置页状态；不暴露凭据本身。 */
export function markByxtAuthExpired(): void {
  if (!state.hydrated) {
    useCredentials().hydrate()
  }
  if (state.byxtCookie.length === 0) {
    state.byxtStatus = 'unconfigured'
    return
  }

  state.byxtStatus = 'expired'
  state.byxtMessage = '登录状态已失效，请重新获取 Cookie'
}

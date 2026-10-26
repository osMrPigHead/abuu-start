/** 凭据读取、保存、规范化、状态与校验，见 docs/trd.md 7.1。 */
import { computed, reactive } from 'vue'
import { ApiError } from '@/api/client'
import { fetchBykcStatus } from '@/api/bykc'
import { fetchByxtStatus } from '@/api/byxt'
import { fetchSpocStatus } from '@/api/spoc'
import { fetchRelayHealth } from '@/api/relay'
import { fetchYgdkOverview } from '@/api/ygdk'
import { maskSecret, normalizeByxtCookie } from '@/utils/credentials'
import { isValidYgdkUid } from '@/utils/ygdk'
import { clearCredentials, readCredentials, writeCredentials } from '@/utils/storage'

export type CredentialStatus = 'unconfigured' | 'configured' | 'checking' | 'expired'
export type RelayStatus = 'checking' | 'ok' | 'error'

const INVALID_COOKIE_MESSAGE =
  '没有识别到有效的 Cookie（应形如 name=value; name2=value2）'
const INVALID_YGDK_UID_MESSAGE = '阳光打卡 UID 必须是十进制整数'
const YGDK_AUTH_EXPIRED_MESSAGE =
  '阳光打卡登录状态已失效，请重新获取 UID 与 token'
const BYKC_AUTH_EXPIRED_MESSAGE =
  '博雅登录状态已失效，请重新获取 auth_token'

const state = reactive({
  byxtCookie: '',
  byxtStatus: 'unconfigured' as CredentialStatus,
  byxtMessage: '',
  spocToken: '',
  spocRoleCode: '',
  spocStatus: 'unconfigured' as CredentialStatus,
  spocMessage: '',
  bykcToken: '',
  bykcStatus: 'unconfigured' as CredentialStatus,
  bykcMessage: '',
  ygdkUid: '',
  ygdkToken: '',
  ygdkStatus: 'unconfigured' as CredentialStatus,
  ygdkMessage: '',
  relayStatus: 'checking' as RelayStatus,
  relayMessage: '',
  hydrated: false,
})

const hasByxt = computed(() => state.byxtCookie.length > 0)
const maskedByxtCookie = computed(() => maskSecret(state.byxtCookie))
const hasSpoc = computed(
  () => state.spocToken.length > 0 && state.spocRoleCode.length > 0,
)
const maskedSpocToken = computed(() => maskSecret(state.spocToken))
const hasBykc = computed(() => state.bykcToken.length > 0)
const maskedBykcToken = computed(() => maskSecret(state.bykcToken))
const hasYgdk = computed(() => state.ygdkUid.length > 0 && state.ygdkToken.length > 0)
const maskedYgdkToken = computed(() => maskSecret(state.ygdkToken))

export function useCredentials() {
  hydrate()

  function hydrate(): void {
    if (state.hydrated) return
    state.hydrated = true

    const stored = readCredentials()
    state.byxtCookie = stored.byxtCookie
    state.spocToken = stored.spocToken
    state.spocRoleCode = stored.spocRoleCode
    state.bykcToken = stored.bykcToken
    state.ygdkUid = stored.ygdkUid
    state.ygdkToken = stored.ygdkToken
    state.byxtStatus = stored.byxtCookie.length > 0 ? 'configured' : 'unconfigured'
    state.spocStatus =
      stored.spocToken.length > 0 && stored.spocRoleCode.length > 0
        ? 'configured'
        : 'unconfigured'
    state.bykcStatus = stored.bykcToken.length > 0 ? 'configured' : 'unconfigured'
    state.ygdkStatus =
      stored.ygdkUid.length > 0 && stored.ygdkToken.length > 0
        ? 'configured'
        : 'unconfigured'
  }

  async function saveByxtCookie(input: string): Promise<boolean> {
    hydrate()
    const normalized = normalizeByxtCookie(input)
    if (!normalized) {
      state.byxtMessage = INVALID_COOKIE_MESSAGE
      return false
    }

    writeCredentials({ ...readCredentials(), byxtCookie: normalized })
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
    writeCredentials({ ...readCredentials(), byxtCookie: '' })
    state.byxtCookie = ''
    state.byxtStatus = 'unconfigured'
    state.byxtMessage = '已清除本研教育管理系统 Cookie'
  }

  async function saveSpocCredentials(tokenInput: string, roleCodeInput: string): Promise<boolean> {
    hydrate()

    const token = tokenInput.trim()
    const roleCode = roleCodeInput.trim()
    if (token.length === 0 || roleCode.length === 0) {
      state.spocMessage = 'Token 与 RoleCode 都必须填写'
      return false
    }

    writeCredentials({ ...readCredentials(), spocToken: token, spocRoleCode: roleCode })
    state.spocToken = token
    state.spocRoleCode = roleCode
    state.spocStatus = 'configured'
    state.spocMessage = ''
    await validateSpoc()
    return true
  }

  async function validateSpoc(): Promise<void> {
    hydrate()
    if (!hasSpoc.value) {
      state.spocStatus = 'unconfigured'
      state.spocMessage = ''
      return
    }

    state.spocStatus = 'checking'
    state.spocMessage = '正在校验…'

    try {
      await fetchSpocStatus()
      state.spocStatus = 'configured'
      state.spocMessage = '校验通过'
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'AUTH_EXPIRED' || error.code === 'NO_CREDENTIAL')
      ) {
        state.spocStatus = 'expired'
        state.spocMessage = 'SPOC 登录状态已失效，请重新获取 Token 与 RoleCode'
        return
      }

      state.spocStatus = 'configured'
      state.spocMessage =
        error instanceof ApiError
          ? error.message
          : '校验失败，请确认本地中继与网络状态'
    }
  }

  function clearSpocCredentials(): void {
    hydrate()
    writeCredentials({ ...readCredentials(), spocToken: '', spocRoleCode: '' })
    state.spocToken = ''
    state.spocRoleCode = ''
    state.spocStatus = 'unconfigured'
    state.spocMessage = '已清除 SPOC 凭据'
  }

  /** 博雅 auth_token：trim 后非空才保存，保存后调用一次资料接口校验。 */
  async function saveBykcToken(tokenInput: string): Promise<boolean> {
    hydrate()

    const token = tokenInput.trim()
    if (token.length === 0) {
      state.bykcMessage = '博雅 auth_token 不能为空'
      return false
    }

    writeCredentials({ ...readCredentials(), bykcToken: token })
    state.bykcToken = token
    state.bykcStatus = 'configured'
    state.bykcMessage = ''
    await validateBykc()
    return true
  }

  async function validateBykc(): Promise<void> {
    hydrate()
    if (!hasBykc.value) {
      state.bykcStatus = 'unconfigured'
      state.bykcMessage = ''
      return
    }

    state.bykcStatus = 'checking'
    state.bykcMessage = '正在校验…'

    try {
      await fetchBykcStatus()
      state.bykcStatus = 'configured'
      state.bykcMessage = '校验通过'
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'AUTH_EXPIRED' || error.code === 'NO_CREDENTIAL')
      ) {
        state.bykcStatus = 'expired'
        state.bykcMessage = BYKC_AUTH_EXPIRED_MESSAGE
        return
      }

      state.bykcStatus = 'configured'
      state.bykcMessage =
        error instanceof ApiError
          ? error.message
          : '校验失败，请确认本地中继与网络状态'
    }
  }

  function clearBykcCredentials(): void {
    hydrate()
    writeCredentials({ ...readCredentials(), bykcToken: '' })
    state.bykcToken = ''
    state.bykcStatus = 'unconfigured'
    state.bykcMessage = '已清除博雅课程凭据'
  }

  /** 阳光 UID 为整数、token 非空才保存；保存后调用一次概览接口校验。 */
  async function saveYgdkCredentials(uidInput: string, tokenInput: string): Promise<boolean> {
    hydrate()

    const uid = uidInput.trim()
    const token = tokenInput.trim()
    if (uid.length === 0 || token.length === 0) {
      state.ygdkMessage = '阳光打卡 UID 与 token 都必须填写'
      return false
    }
    if (!isValidYgdkUid(uid)) {
      state.ygdkMessage = INVALID_YGDK_UID_MESSAGE
      return false
    }

    writeCredentials({ ...readCredentials(), ygdkUid: uid, ygdkToken: token })
    state.ygdkUid = uid
    state.ygdkToken = token
    state.ygdkStatus = 'configured'
    state.ygdkMessage = ''
    await validateYgdk()
    return true
  }

  async function validateYgdk(): Promise<void> {
    hydrate()
    if (!hasYgdk.value) {
      state.ygdkStatus = 'unconfigured'
      state.ygdkMessage = ''
      return
    }

    state.ygdkStatus = 'checking'
    state.ygdkMessage = '正在校验…'

    try {
      await fetchYgdkOverview()
      state.ygdkStatus = 'configured'
      state.ygdkMessage = '校验通过'
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'AUTH_EXPIRED' || error.code === 'NO_CREDENTIAL')
      ) {
        state.ygdkStatus = 'expired'
        state.ygdkMessage = YGDK_AUTH_EXPIRED_MESSAGE
        return
      }

      state.ygdkStatus = 'configured'
      state.ygdkMessage =
        error instanceof ApiError
          ? error.message
          : '校验失败，请确认本地中继与网络状态'
    }
  }

  function clearYgdkCredentials(): void {
    hydrate()
    writeCredentials({ ...readCredentials(), ygdkUid: '', ygdkToken: '' })
    state.ygdkUid = ''
    state.ygdkToken = ''
    state.ygdkStatus = 'unconfigured'
    state.ygdkMessage = '已清除阳光打卡凭据'
  }

  function clearAllCredentials(): void {
    clearCredentials()
    state.byxtCookie = ''
    state.spocToken = ''
    state.spocRoleCode = ''
    state.bykcToken = ''
    state.ygdkUid = ''
    state.ygdkToken = ''
    state.byxtStatus = 'unconfigured'
    state.byxtMessage = '已清除全部凭据'
    state.spocStatus = 'unconfigured'
    state.spocMessage = ''
    state.bykcStatus = 'unconfigured'
    state.bykcMessage = ''
    state.ygdkStatus = 'unconfigured'
    state.ygdkMessage = ''
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
    hasSpoc,
    maskedSpocToken,
    hasBykc,
    maskedBykcToken,
    hasYgdk,
    maskedYgdkToken,
    hydrate,
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
  }
}

/** 供 SPOC 请求在 401 时同步设置页状态；不暴露凭据本身。 */
export function markSpocAuthExpired(): void {
  if (!state.hydrated) {
    useCredentials().hydrate()
  }
  if (!state.spocToken || !state.spocRoleCode) {
    state.spocStatus = 'unconfigured'
    return
  }

  state.spocStatus = 'expired'
  state.spocMessage = 'SPOC 登录状态已失效，请重新获取 Token 与 RoleCode'
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

/** 供博雅广场请求在 401 时同步设置页状态；不暴露凭据本身。 */
export function markBykcAuthExpired(): void {
  if (!state.hydrated) {
    useCredentials().hydrate()
  }
  if (!state.bykcToken) {
    state.bykcStatus = "unconfigured"
    return
  }

  state.bykcStatus = "expired"
  state.bykcMessage = BYKC_AUTH_EXPIRED_MESSAGE
}

/** 供阳光概览请求在 401 时同步设置页状态；不暴露凭据本身。 */
export function markYgdkAuthExpired(): void {
  if (!state.hydrated) {
    useCredentials().hydrate()
  }
  if (!state.ygdkUid || !state.ygdkToken) {
    state.ygdkStatus = 'unconfigured'
    return
  }

  state.ygdkStatus = 'expired'
  state.ygdkMessage = YGDK_AUTH_EXPIRED_MESSAGE
}

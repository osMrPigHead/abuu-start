/** 本地中继连接状态，设置页展示用。 */
import { reactive } from 'vue'
import { ApiError } from '@/api/client'
import { fetchRelayHealth } from '@/api/relay'

export type RelayStatus = 'checking' | 'ok' | 'error'

const state = reactive({
  status: 'checking' as RelayStatus,
  message: '',
})

export function useRelay() {
  return { state, checkRelay }
}

async function checkRelay(): Promise<void> {
  state.status = 'checking'
  state.message = ''

  try {
    await fetchRelayHealth()
    state.status = 'ok'
    state.message = '本地中继运行中'
  } catch (error) {
    state.status = 'error'
    state.message = error instanceof ApiError ? error.message : '无法连接本地中继'
  }
}

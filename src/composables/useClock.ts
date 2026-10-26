import { onScopeDispose, readonly, ref } from 'vue'

/**
 * 每秒更新的本地时间。
 * 在组件 setup 中调用；卸载时自动清理定时器。
 */
export function useClock(intervalMs = 1000) {
  const now = ref(new Date())
  const timer = window.setInterval(() => {
    now.value = new Date()
  }, intervalMs)

  onScopeDispose(() => {
    window.clearInterval(timer)
  })

  return {
    now: readonly(now),
  }
}

import { createApp } from 'vue'
import App from './App.vue'
import { useAuth } from './composables/useAuth'
import router from './router'
import { removeLegacyCredentials } from './utils/storage'
import './style.css'

/**
 * 启动时删除旧明文凭据键（docs/trd-phase3.md 4.5）。
 * 认证校验在挂载后异步进行，不阻塞首屏；校验未决期间各数据源按缓存优先取数，
 * 不把缓存误标为「未登录」，见 docs/trd-phase3.md 7.1。
 */
function bootstrap(): void {
  removeLegacyCredentials()
  createApp(App).use(router).mount('#app')
  void useAuth().hydrate()
}

void bootstrap()

import { createApp } from 'vue'
import App from './App.vue'
import { useAuth } from './composables/useAuth'
import router from './router'
import { removeLegacyCredentials } from './utils/storage'
import './style.css'

/**
 * 启动时删除旧明文凭据键（docs/trd-phase3.md 4.5）；
 * 认证状态就绪后再挂载，避免首页按「未登录」取数。
 */
async function bootstrap(): Promise<void> {
  removeLegacyCredentials()
  await useAuth().hydrate()
  createApp(App).use(router).mount('#app')
}

void bootstrap()

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 本地中继地址；未设置时使用 http://127.0.0.1:3000。 */
  readonly WXT_RELAY_ORIGIN?: string;
}

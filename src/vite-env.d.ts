/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 本地中继地址；未设置时使用 shared/relay.ts 中的默认端口。 */
  readonly WXT_RELAY_ORIGIN?: string;
}

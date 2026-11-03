/**
 * 上游响应信封，只在中继内部使用。
 * 与前端共享的业务契约见 shared/api.ts。
 */

/** byxt 统一响应信封。 */
export type ByxtEnvelope<T> = {
  code: string
  msg?: string | null
  datas: T
}

/** SPOC 统一响应信封。 */
export type SpocEnvelope<T> = {
  code: number
  msg?: string | null
  msg_en?: string | null
  content: T
}

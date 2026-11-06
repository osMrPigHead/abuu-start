/**
 * 中继启动配置：监听地址、端口、托盘开关与监听失败文案。
 * 这里只放纯函数；环境变量读取集中在 server/index.ts。
 */
import { RELAY_PORT } from "../../shared/relay.ts";

export const HOST = "127.0.0.1";
export const DEFAULT_PORT = RELAY_PORT;

export function readPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;

  const value = Number(raw);
  if (Number.isInteger(value) && value > 0 && value < 65536) return value;

  console.warn(`[relay] PORT=${raw} 不合法，改用 ${DEFAULT_PORT}`);
  return DEFAULT_PORT;
}

/** TRAY=0 时完全不创建托盘，便于无桌面环境或 CI 运行。 */
export function isTrayDisabled(raw: string | undefined): boolean {
  return raw?.trim() === "0";
}

export function describeListenError(error: unknown, port: number): string {
  const code = readErrorCode(error);
  if (code === "EADDRINUSE") return `端口 ${port} 已被占用`;
  if (code === "EACCES") return `端口 ${port} 无权限监听`;

  const message =
    error instanceof Error && error.message.trim() !== ""
      ? error.message.trim()
      : "未知错误";
  return message;
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

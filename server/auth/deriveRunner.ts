/**
 * 四源派生编排：顺序执行、同源单飞、代际校验与迟到结果丢弃，
 * 见 docs/trd-phase3.md 6.3。派生算法在 auth/derive.ts。
 */
import { AUTH_SOURCE_LABELS } from "../../shared/auth.ts";
import type { AuthSourceId } from "../../shared/auth.ts";
import { RelayError } from "../core/errors.ts";
import {
  deriveBykc,
  deriveByxt,
  deriveSpoc,
  deriveYgdk,
  SourceDerivationError,
} from "./derive.ts";
import type { CookieJar } from "./cookieJar.ts";
import {
  currentGeneration,
  deleteDeriveFlight,
  getDeriveFlight,
  getSession,
  getSessionJar,
  markSourceExpired,
  saveCurrentCredentials,
  setDeriveFlight,
  setSourceState,
} from "./state.ts";
import type { AuthSession } from "./types.ts";

export async function runDerivation(
  gen: number,
  sources: readonly AuthSourceId[],
): Promise<void> {
  for (const source of sources) {
    if (gen !== currentGeneration()) return;
    await deriveSource(source, gen);
  }
}

export function deriveSource(
  source: AuthSourceId,
  gen = currentGeneration(),
): Promise<boolean> {
  const existing = getDeriveFlight(source);
  if (existing && existing.gen === gen) return existing.promise;

  const promise: Promise<boolean> = runDerive(source, gen).finally(() => {
    deleteDeriveFlight(source, promise);
  });
  setDeriveFlight(source, { gen, promise });
  return promise;
}

async function runDerive(source: AuthSourceId, gen: number): Promise<boolean> {
  const targetSession = getSession();
  const targetJar = getSessionJar();
  if (!targetSession || !targetJar) return false;

  try {
    await deriveIntoSession(source, targetJar, targetSession);
    if (gen !== currentGeneration() || getSessionJar() !== targetJar)
      return false;

    setSourceState(source, "ready", null);
    await saveCurrentCredentials();
    return true;
  } catch (error) {
    if (gen !== currentGeneration() || getSessionJar() !== targetJar)
      return false;

    const message =
      error instanceof SourceDerivationError
        ? error.message
        : `${AUTH_SOURCE_LABELS[source]}派生失败`;
    const authFailure =
      error instanceof RelayError &&
      (error.code === "AUTH_EXPIRED" || error.code === "AUTH_REQUIRED");

    if (authFailure) {
      markSourceExpired(source);
    } else {
      setSourceState(source, "failed", {
        code: "SOURCE_DERIVATION_FAILED",
        message,
      });
    }
    await saveCurrentCredentials();
    return false;
  }
}

/**
 * 单 switch 完成「派生 + 写回」：session 在 await 前捕获，
 * 若期间会话被替换，写入旧对象无害，runDerive 的代际校验会丢弃状态更新。
 */
async function deriveIntoSession(
  source: AuthSourceId,
  jar: CookieJar,
  session: AuthSession,
): Promise<void> {
  switch (source) {
    case "byxt":
      await deriveByxt(jar);
      return;
    case "spoc":
      session.spoc = await deriveSpoc(jar);
      return;
    case "bykc":
      session.bykc = await deriveBykc(jar);
      return;
    case "ygdk":
      session.ygdk = await deriveYgdk(jar);
      return;
  }
}

/** 等待单个数据源派生完成；未轮到该源时短轮询，最长 20 秒。 */
export async function waitForSource(source: AuthSourceId): Promise<void> {
  const current = getSession();
  if (!current || current.sources[source].status !== "pending") return;

  const inFlight = getDeriveFlight(source);
  if (inFlight) {
    await inFlight.promise.catch(() => undefined);
    return;
  }

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const session = getSession();
    if (!session || session.sources[source].status !== "pending") return;

    const pending = getDeriveFlight(source);
    if (pending) {
      await pending.promise.catch(() => undefined);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

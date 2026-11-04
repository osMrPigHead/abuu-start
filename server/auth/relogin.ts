/**
 * 自动重登与会话校验，见 docs/trd.md 6.4。
 * 同一时间只允许一次重登；认证类失败冷却 5 分钟，瞬时失败冷却 30 秒。
 */
import { AUTH_SOURCE_IDS } from "../../shared/auth.ts";
import { RelayError, isTransientRelayCode } from "../core/errors.ts";
import { nowIso } from "../core/datetime.ts";
import {
  activateUc,
  fetchUcStatus,
  looksLikeLoginPage,
  openSsoLogin,
  parseLoginPage,
  submitSsoLogin,
} from "./cas.ts";
import { CookieJar } from "./cookieJar.ts";
import { runDerivation } from "./deriveRunner.ts";
import {
  currentGeneration,
  getSession,
  getSessionJar,
  markSourceExpired,
  saveCurrentCredentials,
  setSessionJar,
  setSourceState,
  setStartupWarning,
  startNewGeneration,
} from "./state.ts";
import type { AuthSession } from "./types.ts";

const RELOGIN_COOLDOWN_MS = 5 * 60 * 1000;
/** 网络或上游 5xx 的瞬时失败冷却，短于认证失败。 */
const TRANSIENT_COOLDOWN_MS = 30 * 1000;

export type ReloginFailureReason =
  "auth" | "upstream" | "captcha" | "no-password";

export type ReloginResult =
  | { ok: true }
  | { ok: false; reason: ReloginFailureReason; error?: RelayError };

let reloginPromise: Promise<ReloginResult> | null = null;
let lastReloginFailedAt = 0;
let lastReloginFailureReason: ReloginFailureReason | null = null;

export async function autoRelogin(): Promise<ReloginResult> {
  const session = getSession();
  if (!session) return { ok: false, reason: "auth" };
  if (session.password === null) return { ok: false, reason: "no-password" };

  const cooldown =
    lastReloginFailureReason === "upstream"
      ? TRANSIENT_COOLDOWN_MS
      : RELOGIN_COOLDOWN_MS;
  if (
    lastReloginFailureReason !== null &&
    Date.now() - lastReloginFailedAt < cooldown
  ) {
    return { ok: false, reason: lastReloginFailureReason };
  }

  if (reloginPromise) return reloginPromise;

  const current = session;
  reloginPromise = performAutoRelogin(current).finally(() => {
    reloginPromise = null;
  });
  return reloginPromise;
}

async function performAutoRelogin(
  current: AuthSession,
): Promise<ReloginResult> {
  if (current.password === null) return { ok: false, reason: "no-password" };

  const nextJar = new CookieJar();

  try {
    const pageResult = await openSsoLogin(nextJar);

    if (pageResult.status === 200) {
      const page = parseLoginPage(pageResult.text);
      if (page.captchaId !== null) return failRelogin("captcha");
      // 200 但不是可识别的登录页（维护页、网关页），按上游暂时不可用处理。
      if (page.execution === null) return failRelogin("upstream");

      const submit = await submitSsoLogin(nextJar, page.hidden, {
        username: current.username,
        password: current.password,
        execution: page.execution,
        captcha: null,
      });

      if (submit.status >= 500) return failRelogin("upstream");
      if (
        submit.status < 200 ||
        submit.status >= 400 ||
        looksLikeLoginPage(submit.text)
      ) {
        return failRelogin("auth");
      }
    } else if (pageResult.status >= 500) {
      return failRelogin("upstream");
    } else if (!(pageResult.status >= 300 && pageResult.status < 400)) {
      return failRelogin("auth");
    }

    await activateUc(nextJar);
    const uc = await fetchUcStatus(nextJar);
    if (!uc.ok) return failRelogin("auth");

    if (getSession() !== current) return { ok: false, reason: "auth" };

    current.cookies = nextJar.serialize();
    current.user = uc.user;
    current.authenticatedAt = nowIso();
    setSessionJar(nextJar);
    startNewGeneration();
    resetReloginState();

    const stale = AUTH_SOURCE_IDS.filter(
      (source) => current.sources[source].status !== "ready",
    );
    for (const source of stale) setSourceState(source, "pending", null);
    await saveCurrentCredentials();
    void runDerivation(currentGeneration(), stale);

    return { ok: true };
  } catch (error) {
    // fetch 抛出的 UPSTREAM_ERROR/UPSTREAM_TIMEOUT 属于瞬时失败。
    if (error instanceof RelayError && isTransientRelayCode(error.code)) {
      return failRelogin("upstream", error);
    }
    return failRelogin("auth");
  }
}

/** 会话校验：网络失败只提示未校验；确认失效才标记四源过期。 */
export async function validateCurrentSession(): Promise<void> {
  const session = getSession();
  const jar = getSessionJar();
  if (!session || !jar) return;

  let status: Awaited<ReturnType<typeof fetchUcStatus>>;
  try {
    status = await fetchUcStatus(jar);
  } catch {
    // 网络/上游不可用时无法判定登录状态：保留会话与四源状态，仅提示未校验。
    setStartupWarning("无法连接统一认证，登录状态未校验");
    return;
  }

  if (status.ok) {
    session.user = status.user;
    setStartupWarning(null);
    return;
  }

  const recovered = await autoRelogin();
  if (recovered.ok) {
    setStartupWarning(null);
    return;
  }

  if (recovered.reason === "upstream") {
    setStartupWarning("无法连接统一认证，登录状态未校验");
    return;
  }

  setStartupWarning("登录状态已失效，请重新登录");
  for (const source of AUTH_SOURCE_IDS) markSourceExpired(source);
}

export function resetReloginState(): void {
  reloginPromise = null;
  lastReloginFailedAt = 0;
  lastReloginFailureReason = null;
}

function failRelogin(
  reason: ReloginFailureReason,
  error?: RelayError,
): ReloginResult {
  lastReloginFailedAt = Date.now();
  lastReloginFailureReason = reason;
  return error ? { ok: false, reason, error } : { ok: false, reason };
}

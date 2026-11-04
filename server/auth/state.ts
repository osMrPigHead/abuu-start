/**
 * 认证会话状态：唯一可变状态与状态迁移、落盘映射、启动恢复、快照与凭据访问器。
 * 其他 auth 模块只读写这里的函数，不各自持有会话副本。
 */
import { AUTH_SOURCE_IDS, emptyAuthSources } from "../../shared/auth.ts";
import type {
  AuthSourceError,
  AuthSourceId,
  AuthSourceState,
  AuthSources,
  AuthStatusResponse,
} from "../../shared/auth.ts";
import { RelayError } from "../core/errors.ts";
import { nowIso } from "../core/datetime.ts";
import { BYXT_BASE_URL } from "../upstreams/urls.ts";
import { CookieJar } from "./cookieJar.ts";
import {
  deleteCredentials,
  loadCredentials,
  saveCredentials,
} from "./store.ts";
import type {
  AuthSession,
  CredentialFile,
  SpocCredential,
  YgdkCredential,
} from "./types.ts";

let session: AuthSession | null = null;
let sessionJar: CookieJar | null = null;
let persisted = false;
let generation = 0;
let startupWarning: string | null = null;
let readyPromise: Promise<void> | null = null;

/** 同一源并发派生时复用同一个 Promise，避免重复请求与状态互相覆盖。 */
const derivePromises = new Map<
  AuthSourceId,
  { gen: number; promise: Promise<boolean> }
>();

export type DeriveFlight = { gen: number; promise: Promise<boolean> };

export function getSession(): AuthSession | null {
  return session;
}

export function getSessionJar(): CookieJar | null {
  return sessionJar;
}

export function getPersisted(): boolean {
  return persisted;
}

export function getStartupWarning(): string | null {
  return startupWarning;
}

export function setStartupWarning(value: string | null): void {
  startupWarning = value;
}

export function currentGeneration(): number {
  return generation;
}

export function startNewGeneration(): void {
  generation += 1;
  derivePromises.clear();
}

export function getDeriveFlight(
  source: AuthSourceId,
): DeriveFlight | undefined {
  return derivePromises.get(source);
}

export function setDeriveFlight(
  source: AuthSourceId,
  flight: DeriveFlight,
): void {
  derivePromises.set(source, flight);
}

export function deleteDeriveFlight(
  source: AuthSourceId,
  promise: Promise<boolean>,
): void {
  if (derivePromises.get(source)?.promise === promise) {
    derivePromises.delete(source);
  }
}

/** 所有 /api 请求进入前调用；保证启动恢复只跑一次。 */
export function ensureAuthReady(): Promise<void> {
  readyPromise ??= restoreSession();
  return readyPromise;
}

export function assignSession(next: AuthSession, jar: CookieJar): void {
  session = next;
  sessionJar = jar;
}

export function setSessionJar(jar: CookieJar): void {
  sessionJar = jar;
}

export function clearSession(): void {
  session = null;
  sessionJar = null;
  persisted = false;
  startupWarning = null;
}

/* ------------------------------ 业务凭据访问器 ------------------------------ */

export function requireSession(): AuthSession {
  if (!session) throw new RelayError("AUTH_REQUIRED", "尚未登录");
  return session;
}

export function byxtCookieHeader(): string {
  requireSourceReady("byxt");
  const value = sessionJar?.headerFor(BYXT_BASE_URL) ?? "";

  if (value.length === 0) {
    setSourceState("byxt", "expired", {
      code: "AUTH_EXPIRED",
      message: "本研教育管理系统登录状态已失效",
    });
    throw new RelayError("AUTH_EXPIRED", "本研教育管理系统登录状态已失效");
  }
  return value;
}

export function spocCredentials(): SpocCredential {
  const current = requireSourceReady("spoc");
  if (!current.spoc) {
    throw new RelayError("AUTH_EXPIRED", "SPOC 登录状态已失效");
  }
  return current.spoc;
}

export function bykcToken(): string {
  const current = requireSourceReady("bykc");
  if (!current.bykc) {
    throw new RelayError("AUTH_EXPIRED", "博雅登录状态已失效");
  }
  return current.bykc.token;
}

export function ygdkCredentials(): YgdkCredential {
  const current = requireSourceReady("ygdk");
  if (!current.ygdk) {
    throw new RelayError("AUTH_EXPIRED", "阳光打卡登录状态已失效");
  }
  return current.ygdk;
}

function requireSourceReady(source: AuthSourceId): AuthSession {
  if (!session) throw new RelayError("AUTH_REQUIRED", "尚未登录");

  const state = session.sources[source];
  if (state.status === "pending") {
    throw new RelayError("SOURCE_BUSY", "数据源正在派生，请稍后重试");
  }
  if (state.status !== "ready") {
    throw new RelayError("AUTH_EXPIRED", "登录状态已失效，请重新登录");
  }

  return session;
}

/* -------------------------------- 状态迁移 -------------------------------- */

export function setSourceState(
  source: AuthSourceId,
  status: AuthSourceState["status"],
  error: AuthSourceError | null,
): void {
  if (!session) return;
  session.sources[source] = {
    status,
    updatedAt: status === "unconfigured" ? null : nowIso(),
    error,
  };
}

export function markSourceExpired(source: AuthSourceId): void {
  setSourceState(source, "expired", {
    code: "AUTH_EXPIRED",
    message: "登录状态已失效，请重新登录",
  });
}

export function pendingSources(): AuthSources {
  const sources = emptyAuthSources();
  for (const source of AUTH_SOURCE_IDS) {
    sources[source] = { status: "pending", updatedAt: null, error: null };
  }
  return sources;
}

export function snapshot(): AuthStatusResponse {
  if (sessionJar && session) session.cookies = sessionJar.serialize();

  const current = session;
  const response: AuthStatusResponse = {
    authenticated: current !== null,
    user: current?.user ?? null,
    authenticatedAt: current?.authenticatedAt ?? null,
    persisted,
    deriving:
      current !== null &&
      AUTH_SOURCE_IDS.some(
        (source) => current.sources[source].status === "pending",
      ),
    sources: cloneSources(),
  };

  if (startupWarning !== null) response.warning = startupWarning;
  return response;
}

export function cloneSources(): AuthSources {
  const sources = emptyAuthSources();
  if (!session) return sources;

  for (const source of AUTH_SOURCE_IDS) {
    const state = session.sources[source];
    sources[source] = {
      status: state.status,
      updatedAt: state.updatedAt,
      error: state.error === null ? null : { ...state.error },
    };
  }
  return sources;
}

/* -------------------------------- 落盘与恢复 -------------------------------- */

export async function saveCurrentCredentials(): Promise<boolean> {
  const current = session;
  if (!current) return false;
  if (sessionJar) current.cookies = sessionJar.serialize();

  const sources = {} as CredentialFile["sources"];
  for (const source of AUTH_SOURCE_IDS) {
    const state = current.sources[source];
    sources[source] = { status: state.status, updatedAt: state.updatedAt };
  }

  persisted = await saveCredentials({
    version: 1,
    username: current.username,
    password: current.password,
    user: current.user,
    authenticatedAt: current.authenticatedAt,
    cookies: current.cookies,
    spoc: current.spoc,
    bykc: current.bykc,
    ygdk: current.ygdk,
    sources,
  });
  return persisted;
}

export async function deletePersistedCredentials(): Promise<string[]> {
  return deleteCredentials();
}

export async function restoreSession(): Promise<void> {
  const loaded = await loadCredentials();

  if (loaded.kind === "missing") {
    persisted = false;
    return;
  }

  if (loaded.kind === "corrupt") {
    persisted = false;
    startupWarning = "登录状态无法读取，请重新登录";
    return;
  }

  const file = loaded.credentials;
  const now = Date.now();
  const cookies = file.cookies.filter(
    (cookie) => cookie.expiresAt === null || cookie.expiresAt > now,
  );

  const restoredJar = new CookieJar();
  restoredJar.load(cookies);

  const sources = emptyAuthSources();
  for (const source of AUTH_SOURCE_IDS) {
    const stored = file.sources[source];
    if (stored.status === "pending") {
      sources[source] = {
        status: "failed",
        updatedAt: stored.updatedAt,
        error: {
          code: "SOURCE_DERIVATION_FAILED",
          message: "上次派生未完成，请重试",
        },
      };
      continue;
    }

    sources[source] = {
      status: stored.status,
      updatedAt: stored.updatedAt,
      error: null,
    };
  }

  session = {
    username: file.username,
    password: file.password,
    user: file.user,
    authenticatedAt: file.authenticatedAt,
    cookies,
    spoc: file.spoc,
    bykc: file.bykc,
    ygdk: file.ygdk,
    sources,
  };
  sessionJar = restoredJar;
  persisted = true;
  startupWarning = null;
}

/**
 * 认证门面：启动恢复、状态查询、登录/登出、单源重试与业务请求自动重登。
 * 可变状态在 auth/state.ts；登录、预加载、重登与派生编排各自独立。
 */
import type {
  AuthLogoutResponse,
  AuthSourceId,
  AuthSourceRetryResponse,
  AuthStatusResponse,
} from "../../shared/auth.ts";
import { isAuthSourceId } from "../../shared/auth.ts";
import { RelayError, toUpstreamRelayError } from "../core/errors.ts";
import { SSO_LOGOUT_URL } from "./cas.ts";
import { deriveSource, waitForSource } from "./deriveRunner.ts";
import { requestWithJar } from "./http.ts";
import { resetLoginState } from "./login.ts";
import { clearLoginAttempts, pruneLoginAttempts } from "./preload.ts";
import {
  autoRelogin,
  resetReloginState,
  validateCurrentSession,
} from "./relogin.ts";
import {
  bykcToken,
  byxtCookieHeader,
  clearSession,
  currentGeneration,
  deletePersistedCredentials,
  ensureAuthReady,
  getSession,
  getSessionJar,
  markSourceExpired,
  requireSession,
  setSourceState,
  snapshot,
  spocCredentials,
  startNewGeneration,
  ygdkCredentials,
} from "./state.ts";

export { loginAuth } from "./login.ts";
export { preloadAuth } from "./preload.ts";
export {
  bykcToken,
  byxtCookieHeader,
  ensureAuthReady,
  requireSession,
  spocCredentials,
  ygdkCredentials,
};

const LOGOUT_TIMEOUT_MS = 5_000;

export async function getAuthStatus(
  validate: boolean,
): Promise<AuthStatusResponse> {
  await ensureAuthReady();
  pruneLoginAttempts();

  if (!getSession()) return snapshot();
  if (validate) await validateCurrentSession();
  return snapshot();
}

export async function retryAuthSource(
  sourceValue: string,
): Promise<AuthSourceRetryResponse> {
  await ensureAuthReady();

  if (!isAuthSourceId(sourceValue)) {
    throw new RelayError("SOURCE_UNKNOWN", "未知数据源");
  }

  const source = sourceValue;
  const current = requireSession();
  if (current.sources[source].status === "pending") {
    throw new RelayError("SOURCE_BUSY", "该数据源正在派生");
  }

  setSourceState(source, "pending", null);
  await deriveSource(source, currentGeneration());
  const state = requireSession().sources[source];

  return {
    source,
    status: state.status,
    updatedAt: state.updatedAt,
    error: state.error,
  };
}

export async function logoutAuth(): Promise<AuthLogoutResponse> {
  await ensureAuthReady();

  const jar = getSessionJar();
  if (jar) {
    try {
      await requestWithJar(
        jar,
        SSO_LOGOUT_URL,
        {},
        {
          maxRedirects: 0,
          timeoutMs: LOGOUT_TIMEOUT_MS,
        },
      );
    } catch {
      // 尽力登出；失败不阻塞本地清理。
    }
  }

  startNewGeneration();
  clearSession();
  resetReloginState();
  resetLoginState();
  clearLoginAttempts();

  const failed = await deletePersistedCredentials();
  return failed.length > 0
    ? { ok: true, warning: "部分凭据文件未能删除" }
    : { ok: true };
}

/** 业务请求的自动重登包装，见 docs/trd.md 3.5 / 6.4。 */
export async function withSourceRetry<T>(
  source: AuthSourceId,
  handler: () => Promise<T> | T,
): Promise<T> {
  await ensureAuthReady();

  // 该源正在派生时先等它结束，避免首页取数直接收到 409。
  await waitForSource(source);

  try {
    return await handler();
  } catch (error) {
    if (!(error instanceof RelayError) || error.code !== "AUTH_EXPIRED")
      throw error;
    if (!getSession()) throw new RelayError("AUTH_REQUIRED", "尚未登录");

    const recovered = await autoRelogin();
    if (!recovered.ok) {
      // 网络/上游不可用时无法判定登录状态：按瞬时失败返回，不标记已失效。
      if (recovered.reason === "upstream") {
        throw toUpstreamRelayError(
          recovered.error,
          "无法连接上游服务，请稍后重试",
        );
      }

      markSourceExpired(source);
      throw new RelayError("AUTH_EXPIRED", "登录状态已失效，请重新登录");
    }

    const derived = await deriveSource(source);
    if (!derived) {
      if (requireSession().sources[source].status === "expired") {
        throw new RelayError("AUTH_EXPIRED", "登录状态已失效，请重新登录");
      }
      throw new RelayError("UPSTREAM_ERROR", "数据源派生失败，请稍后重试");
    }

    try {
      return await handler();
    } catch (retryError) {
      if (
        retryError instanceof RelayError &&
        retryError.code === "AUTH_EXPIRED"
      ) {
        markSourceExpired(source);
      }
      throw retryError;
    }
  }
}

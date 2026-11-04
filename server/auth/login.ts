/**
 * 手动登录、UC 激活与登录入参校验，见 docs/trd.md 6.2 / 6.5。
 * SSO 页面与表单提交在 auth/cas.ts；本模块只编排会话建立与派生启动。
 */
import { AUTH_SOURCE_IDS } from "../../shared/auth.ts";
import type { AuthLoginResponse } from "../../shared/auth.ts";
import { RelayError } from "../core/errors.ts";
import { nowIso } from "../core/datetime.ts";
import { isRecord } from "../core/guards.ts";
import {
  activateUc,
  classifyLoginFailure,
  fetchUcStatus,
  looksLikeLoginPage,
  submitSsoLogin,
} from "./cas.ts";
import { runDerivation } from "./deriveRunner.ts";
import {
  hasLoginAttempt,
  pruneLoginAttempts,
  takeLoginAttempt,
} from "./preload.ts";
import { resetReloginState } from "./relogin.ts";
import {
  assignSession,
  cloneSources,
  currentGeneration,
  ensureAuthReady,
  getSession,
  getSessionJar,
  pendingSources,
  saveCurrentCredentials,
  setStartupWarning,
  startNewGeneration,
} from "./state.ts";
import type { LoginAttempt } from "./types.ts";

type LoginInput = {
  loginId: string;
  username: string | null;
  password: string | null;
  captcha: string | null;
};

let loginInFlight = false;

export async function loginAuth(raw: unknown): Promise<AuthLoginResponse> {
  await ensureAuthReady();
  pruneLoginAttempts();

  const input = readLoginInput(raw);
  if (!hasLoginAttempt(input.loginId)) {
    throw new RelayError("INVALID_REQUEST", "登录已过期，请刷新验证码后重试");
  }

  if (loginInFlight) {
    throw new RelayError("LOGIN_IN_PROGRESS", "登录请求正在处理，请稍候");
  }

  const attempt = takeLoginAttempt(input.loginId);
  if (!attempt) {
    throw new RelayError("INVALID_REQUEST", "登录已过期，请刷新验证码后重试");
  }

  loginInFlight = true;
  try {
    return await performLogin(attempt, input);
  } finally {
    loginInFlight = false;
  }
}

/** 退出登录时清除单飞闸门。 */
export function resetLoginState(): void {
  loginInFlight = false;
}

async function performLogin(
  attempt: LoginAttempt,
  input: LoginInput,
): Promise<AuthLoginResponse> {
  let username = input.username?.trim() ?? "";
  let password = input.password;

  if (!attempt.alreadyLoggedIn) {
    if (username.length === 0 || password === null) {
      throw new RelayError("INVALID_CREDENTIALS", "请填写学号与密码");
    }

    let captcha: string | null = null;
    if (attempt.captchaId !== null) {
      captcha = input.captcha?.trim() ?? "";
      if (captcha.length === 0) {
        throw new RelayError("CAPTCHA_REQUIRED", "需要验证码，请刷新后重试");
      }
    }

    const result = await submitSsoLogin(attempt.jar, attempt.hidden, {
      username,
      password,
      execution: attempt.execution ?? "",
      captcha,
    });

    if (result.status === 401 || looksLikeLoginPage(result.text)) {
      throw classifyLoginFailure(result.text, result.url);
    }

    if (result.status < 200 || result.status >= 400) {
      throw new RelayError("UPSTREAM_ERROR", "统一认证登录失败，请稍后重试");
    }
  }

  await activateUc(attempt.jar);
  const uc = await fetchUcStatus(attempt.jar);
  if (!uc.ok) {
    throw new RelayError("UPSTREAM_ERROR", "统一认证登录失败，请稍后重试");
  }

  const previous = getSession();
  if (
    password === null &&
    previous !== null &&
    previous.username === (username || previous.username)
  ) {
    password = previous.password;
  }
  if (username.length === 0) username = previous?.username ?? uc.user.schoolid;

  const previousJar = getSessionJar();
  const nextJar = attempt.jar;
  startNewGeneration();
  resetReloginState();

  const authenticatedAt = nowIso();
  assignSession(
    {
      username,
      password,
      user: uc.user,
      authenticatedAt,
      cookies: nextJar.serialize(),
      spoc: null,
      bykc: null,
      ygdk: null,
      sources: pendingSources(),
    },
    nextJar,
  );
  setStartupWarning(null);
  const persisted = await saveCurrentCredentials();
  previousJar?.clear();

  void runDerivation(currentGeneration(), AUTH_SOURCE_IDS);

  const response: AuthLoginResponse = {
    authenticated: true,
    user: uc.user,
    authenticatedAt,
    persisted,
    sources: cloneSources(),
  };

  if (!persisted) {
    response.warning = "无法保存登录状态，本次运行内仍可使用";
  } else if (password === null) {
    response.warning = "未保存密码，会话失效后需重新登录";
  }

  return response;
}

function readLoginInput(raw: unknown): LoginInput {
  if (!isRecord(raw)) {
    throw new RelayError("INVALID_REQUEST", "请求体必须是 JSON 对象");
  }

  const loginId = readString(raw.loginId, 128);
  if (loginId === null) {
    throw new RelayError("INVALID_REQUEST", "缺少 loginId");
  }

  return {
    loginId,
    username: readString(raw.username, 128),
    password: readSecret(raw.password, 256),
    captcha: readString(raw.captcha, 32),
  };
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > maxLength) return null;
  return text;
}

/** 密码不 trim：前后空格可能是密码的一部分。 */
function readSecret(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > maxLength) return null;
  return value;
}

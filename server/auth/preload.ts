/**
 * 登录尝试缓存与验证码预加载，见 docs/trd.md 6.1。
 * 尝试只存在内存，默认 10 分钟、最多 5 个；登录后立即失效。
 */
import { randomUUID } from "node:crypto";
import { RelayError } from "../core/errors.ts";
import {
  captchaDataUrl,
  captchaUrl,
  LOGIN_TIMEOUT_MS,
  openSsoLogin,
  parseLoginPage,
  type LoginPage,
} from "./cas.ts";
import { CookieJar } from "./cookieJar.ts";
import { downloadWithJar } from "./http.ts";
import { ensureAuthReady, getSession } from "./state.ts";
import type { LoginAttempt } from "./types.ts";
import type { AuthPreloadResponse } from "../../shared/auth.ts";

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const CAPTCHA_TTL_MS = 10 * 60 * 1000;

const attempts = new Map<string, LoginAttempt>();

export async function preloadAuth(): Promise<AuthPreloadResponse> {
  await ensureAuthReady();
  pruneLoginAttempts();

  const attemptJar = new CookieJar();
  const current = getSession();
  if (current) attemptJar.load(current.cookies);

  const pageResult = await openSsoLogin(attemptJar);

  const alreadyLoggedIn = pageResult.status >= 300 && pageResult.status < 400;
  if (!alreadyLoggedIn && pageResult.status !== 200) {
    throw new RelayError("UPSTREAM_ERROR", "统一认证暂时不可用，请稍后重试");
  }

  const page: LoginPage = alreadyLoggedIn
    ? { execution: null, captchaId: null, hidden: {} }
    : parseLoginPage(pageResult.text);

  // 200 但不是可识别的登录页（维护页、WebVPN 门页等）：明确报上游错误，避免空 execution 提交。
  if (!alreadyLoggedIn && page.execution === null) {
    throw new RelayError(
      "UPSTREAM_ERROR",
      "统一认证页面无法识别，请稍后重试或检查网络",
    );
  }

  let captchaImage: string | null = null;
  if (page.captchaId !== null) {
    try {
      const image = await downloadWithJar(
        attemptJar,
        captchaUrl(page.captchaId),
        {},
        {
          maxRedirects: 0,
          timeoutMs: LOGIN_TIMEOUT_MS,
        },
      );
      if (
        image.status >= 200 &&
        image.status < 300 &&
        image.data.byteLength > 0
      ) {
        captchaImage = captchaDataUrl(image.contentType, image.data);
      }
    } catch {
      // 验证码图片失败时返回 captchaRequired:true；设置页提示刷新验证码。
    }
  }

  const id = randomUUID();
  attempts.set(id, {
    id,
    jar: attemptJar,
    execution: page.execution,
    captchaId: page.captchaId,
    hidden: page.hidden,
    alreadyLoggedIn,
    createdAt: Date.now(),
  });

  while (attempts.size > MAX_LOGIN_ATTEMPTS) {
    const oldest = [...attempts.values()].sort(
      (left, right) => left.createdAt - right.createdAt,
    )[0];
    if (!oldest) break;
    attempts.delete(oldest.id);
  }

  const response: AuthPreloadResponse = {
    loginId: id,
    captchaRequired: page.captchaId !== null,
    alreadyLoggedIn,
  };
  if (captchaImage !== null) {
    response.captcha = {
      image: captchaImage,
      expiresAt: new Date(Date.now() + CAPTCHA_TTL_MS).toISOString(),
    };
  }
  return response;
}

export function pruneLoginAttempts(): void {
  const now = Date.now();
  for (const [id, attempt] of attempts) {
    if (now - attempt.createdAt > LOGIN_ATTEMPT_TTL_MS) attempts.delete(id);
  }
}

/** 原子取出并删除一次登录尝试；登录成功或失败后都不再复用。 */
export function takeLoginAttempt(id: string): LoginAttempt | undefined {
  const attempt = attempts.get(id);
  if (!attempt) return undefined;
  attempts.delete(id);
  return attempt;
}

export function hasLoginAttempt(id: string): boolean {
  return attempts.has(id);
}

export function clearLoginAttempts(): void {
  attempts.clear();
}

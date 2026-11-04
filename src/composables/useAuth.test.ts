import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthLoginResponse,
  AuthPreloadResponse,
  AuthSourceState,
  AuthStatusResponse,
} from "@shared/auth";

vi.mock("@/api/auth", () => ({
  fetchAuthStatus: vi.fn(),
  loginAuth: vi.fn(),
  logoutAuth: vi.fn(),
  preloadAuth: vi.fn(),
  retryAuthSource: vi.fn(),
}));

import {
  fetchAuthStatus,
  loginAuth,
  logoutAuth,
  preloadAuth,
  retryAuthSource,
} from "@/api/auth";

const fetchStatus = vi.mocked(fetchAuthStatus);
const login = vi.mocked(loginAuth);
const logout = vi.mocked(logoutAuth);
const preload = vi.mocked(preloadAuth);
const retrySourceApi = vi.mocked(retryAuthSource);

function sourceState(
  overrides: Partial<AuthSourceState> = {},
): AuthSourceState {
  return { status: "unconfigured", updatedAt: null, error: null, ...overrides };
}

function sources() {
  return {
    byxt: sourceState(),
    spoc: sourceState(),
    bykc: sourceState(),
    ygdk: sourceState(),
  };
}

function status(
  overrides: Partial<AuthStatusResponse> = {},
): AuthStatusResponse {
  return {
    authenticated: false,
    user: null,
    authenticatedAt: null,
    persisted: false,
    deriving: false,
    sources: sources(),
    ...overrides,
  };
}

function loginResponse(
  overrides: Partial<AuthLoginResponse> = {},
): AuthLoginResponse {
  return {
    authenticated: true,
    user: { name: "张三", schoolid: "20370001" },
    authenticatedAt: new Date(2026, 2, 2, 8, 0).toISOString(),
    persisted: true,
    sources: sources(),
    ...overrides,
  };
}

function preloadResponse(
  overrides: Partial<AuthPreloadResponse> = {},
): AuthPreloadResponse {
  return {
    loginId: "login-1",
    captchaRequired: false,
    alreadyLoggedIn: false,
    ...overrides,
  };
}

async function loadAuth() {
  vi.resetModules();
  const [mod, client] = await Promise.all([
    import("@/composables/useAuth"),
    import("@/api/client"),
  ]);
  return { ...mod, ApiError: client.ApiError };
}

beforeEach(() => {
  fetchStatus.mockReset();
  login.mockReset();
  logout.mockReset();
  preload.mockReset();
  retrySourceApi.mockReset();
});

describe("useAuth auth checks", () => {
  it("初始校验中不拦截业务请求", async () => {
    const { useAuth } = await loadAuth();
    const auth = useAuth();
    expect(auth.isAuthBlocked()).toBe(false);
  });

  it("hydrate 成功应用未登录状态，之后拦截业务请求", async () => {
    fetchStatus.mockResolvedValue(status());
    const { useAuth } = await loadAuth();
    const auth = useAuth();

    await auth.hydrate();

    expect(fetchStatus).toHaveBeenCalledWith(true);
    expect(auth.state.checking).toBe(false);
    expect(auth.state.checkFailed).toBe(false);
    expect(auth.isAuthBlocked()).toBe(true);
  });

  it("hydrate 成功应用已登录状态", async () => {
    fetchStatus.mockResolvedValue(
      status({
        authenticated: true,
        user: { name: "张三", schoolid: "20370001" },
        authenticatedAt: new Date(2026, 2, 2).toISOString(),
      }),
    );
    const { useAuth } = await loadAuth();
    const auth = useAuth();

    await auth.hydrate();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.isAuthBlocked()).toBe(false);
    expect(auth.state.user?.name).toBe("张三");
  });

  it("hydrate 失败时记录 warning 并放行请求", async () => {
    const { useAuth, ApiError } = await loadAuth();
    fetchStatus.mockRejectedValue(
      new ApiError("RELAY_UNREACHABLE", "中继未启动", 0),
    );
    const auth = useAuth();

    await auth.hydrate();

    expect(auth.state.checking).toBe(false);
    expect(auth.state.checkFailed).toBe(true);
    expect(auth.state.warning).toBe("中继未启动");
    expect(auth.isAuthBlocked()).toBe(false);
  });
});

describe("useAuth login flow", () => {
  it("preload 映射验证码与已登录状态", async () => {
    preload.mockResolvedValue(
      preloadResponse({
        captchaRequired: true,
        alreadyLoggedIn: true,
        captcha: { image: "data:image/png;base64,xx", expiresAt: "soon" },
      }),
    );
    const { useAuth } = await loadAuth();
    const auth = useAuth();

    const result = await auth.preload();

    expect(result?.captchaRequired).toBe(true);
    expect(auth.state.captchaRequired).toBe(true);
    expect(auth.state.captchaImage).toBe("data:image/png;base64,xx");
    expect(auth.state.alreadyLoggedIn).toBe(true);
  });

  it("preload 失败时映射错误码和文案", async () => {
    const { useAuth, ApiError } = await loadAuth();
    preload.mockRejectedValue(new ApiError("UPSTREAM_TIMEOUT", "超时", 504));
    const auth = useAuth();

    expect(await auth.preload()).toBeNull();
    expect(auth.state.error).toBe("统一认证请求超时，请稍后重试");
    expect(auth.state.lastErrorCode).toBe("UPSTREAM_TIMEOUT");
  });

  it("login 未预加载时先预加载并提交用户名密码", async () => {
    preload.mockResolvedValue(preloadResponse());
    login.mockResolvedValue(loginResponse());
    const { useAuth } = await loadAuth();
    const auth = useAuth();

    const ok = await auth.login({ username: " 20370001 ", password: "secret" });

    expect(ok).toBe(true);
    expect(login).toHaveBeenCalledWith({
      loginId: "login-1",
      username: "20370001",
      password: "secret",
    });
    expect(auth.state.authenticated).toBe(true);
    expect(auth.state.deriving).toBe(true);
    expect(auth.state.loading).toBe(false);
  });

  it("验证码错误时刷新验证码并保留错误提示", async () => {
    const { useAuth, ApiError } = await loadAuth();
    preload.mockResolvedValueOnce(preloadResponse({ captchaRequired: true }));
    login.mockRejectedValue(new ApiError("CAPTCHA_INVALID", "验证码错误", 401));
    preload.mockResolvedValueOnce(preloadResponse({ captchaRequired: true }));
    const auth = useAuth();

    const ok = await auth.login({
      username: "20370001",
      password: "secret",
      captcha: "1234",
    });

    expect(ok).toBe(false);
    expect(preload).toHaveBeenCalledTimes(2);
    expect(auth.state.error).toBe("验证码错误或已过期，请刷新后重试");
    expect(auth.state.lastErrorCode).toBe("CAPTCHA_INVALID");
  });

  it("已登录状态登录时不提交用户名密码", async () => {
    preload.mockResolvedValue(preloadResponse({ alreadyLoggedIn: true }));
    login.mockResolvedValue(loginResponse());
    const { useAuth } = await loadAuth();
    const auth = useAuth();

    await auth.login({ username: "20370001", password: "secret" });

    expect(login).toHaveBeenCalledWith({ loginId: "login-1" });
  });
});

describe("useAuth logout and sources", () => {
  it("logout 成功重置状态", async () => {
    logout.mockResolvedValue({ ok: true });
    const { useAuth } = await loadAuth();
    const auth = useAuth();
    auth.state.authenticated = true;
    auth.state.user = { name: "张三", schoolid: "20370001" };

    expect(await auth.logout()).toBe(true);
    expect(auth.state.authenticated).toBe(false);
    expect(auth.state.user).toBeNull();
  });

  it("logout 失败保留错误", async () => {
    const { useAuth, ApiError } = await loadAuth();
    logout.mockRejectedValue(new ApiError("UPSTREAM_ERROR", "登出失败", 502));
    const auth = useAuth();

    expect(await auth.logout()).toBe(false);
    expect(auth.state.error).toBe("登出失败");
  });

  it("retrySource 更新单源状态与 deriving", async () => {
    retrySourceApi.mockResolvedValue({
      source: "spoc",
      status: "ready",
      updatedAt: "2026-03-02T08:00:00.000Z",
      error: null,
    });
    const { useAuth } = await loadAuth();
    const auth = useAuth();

    await auth.retrySource("spoc");

    expect(auth.state.sources.spoc.status).toBe("ready");
    expect(auth.state.deriving).toBe(false);
  });

  it("markSourceExpired 标记对应数据源", async () => {
    const { useAuth, markSourceExpired } = await loadAuth();
    const auth = useAuth();

    markSourceExpired("bykc");

    expect(auth.state.sources.bykc.status).toBe("expired");
    expect(auth.state.sources.bykc.error?.code).toBe("AUTH_EXPIRED");
  });
});

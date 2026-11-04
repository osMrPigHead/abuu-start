// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CookieJar } from "./cookieJar.ts";
import { loginAuth, resetLoginState } from "./login.ts";
import { clearLoginAttempts, preloadAuth } from "./preload.ts";
import { autoRelogin, resetReloginState } from "./relogin.ts";
import {
  assignSession,
  clearSession,
  getSession,
  pendingSources,
  setStartupWarning,
  startNewGeneration,
} from "./state.ts";
import type { AuthSession } from "./types.ts";

vi.mock("./store.ts", () => ({
  loadCredentials: vi.fn(async () => ({ kind: "missing" })),
  saveCredentials: vi.fn(async () => true),
  deleteCredentials: vi.fn(async () => []),
}));

vi.mock("./derive.ts", () => {
  class SourceDerivationError extends Error {}
  return {
    SourceDerivationError,
    deriveByxt: vi.fn(async () => undefined),
    deriveSpoc: vi.fn(async () => ({ token: "t", roleCode: "r" })),
    deriveBykc: vi.fn(async () => ({ token: "t" })),
    deriveYgdk: vi.fn(async () => ({ uid: 1, token: "t" })),
  };
});

const SSO_LOGIN = "https://sso.buaa.edu.cn/login";
const UC_LOGIN = "https://uc.buaa.edu.cn/api/login";
const UC_STATUS = "https://uc.buaa.edu.cn/api/uc/status";
const CAPTCHA = "https://sso.buaa.edu.cn/captcha";

const loginPageWithCaptcha = `<html><body><form>
  <input type="hidden" name="lt" value="LT-1" />
  <input type="hidden" name="execution" value="e1" />
  <script>config.captcha = {id: 'c1'}</script>
</form></body></html>`;

const loginPageWithoutCaptcha = `<html><body>
  <input type="hidden" name="execution" value="e1" />
</body></html>`;

const ucUser = { code: 0, data: { name: "张三", schoolid: "20370001" } };

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** openSsoLogin 以 maxRedirects: 0 调用；带 Location 会抛“跳转次数过多”，无 Location 的 302 才表示已登录。 */
function redirectResponse(): Response {
  return new Response(null, { status: 302 });
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (input: string | URL, init?: RequestInit) =>
    handler(String(input), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function seedSession(password: string | null = "p"): AuthSession {
  return {
    username: "20370001",
    password,
    user: { name: "旧用户", schoolid: "20370001" },
    authenticatedAt: "2026-01-01T00:00:00.000Z",
    cookies: [],
    spoc: null,
    bykc: null,
    ygdk: null,
    sources: pendingSources(),
  };
}

beforeEach(() => {
  clearSession();
  startNewGeneration();
  setStartupWarning(null);
  clearLoginAttempts();
  resetLoginState();
  resetReloginState();
});

describe("preloadAuth", () => {
  it("SSO 已登录时无需验证码", async () => {
    stubFetch((url) => {
      if (url === SSO_LOGIN) return redirectResponse();
      return new Response("not found", { status: 404 });
    });

    const response = await preloadAuth();
    expect(response.alreadyLoggedIn).toBe(true);
    expect(response.captchaRequired).toBe(false);
  });

  it("识别验证码并返回 data URL", async () => {
    stubFetch((url) => {
      if (url === SSO_LOGIN) return htmlResponse(loginPageWithCaptcha);
      if (url.startsWith(CAPTCHA)) {
        return new Response(Buffer.from("image-bytes"), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const response = await preloadAuth();
    expect(response.captchaRequired).toBe(true);
    expect(response.alreadyLoggedIn).toBe(false);
    expect(response.captcha?.image.startsWith("data:image/png;base64,")).toBe(
      true,
    );
  });

  it("无法识别的登录页抛 UPSTREAM_ERROR", async () => {
    stubFetch(() => htmlResponse("<html>维护中</html>"));
    await expect(preloadAuth()).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });
});

describe("loginAuth", () => {
  it("已登录时激活 UC 并建立会话", async () => {
    stubFetch((url) => {
      if (url === SSO_LOGIN) return redirectResponse();
      if (url.startsWith(UC_LOGIN)) return new Response("", { status: 200 });
      if (url === UC_STATUS) return jsonResponse(ucUser);
      return new Response("not found", { status: 404 });
    });

    const preload = await preloadAuth();
    const response = await loginAuth({ loginId: preload.loginId });

    expect(response.authenticated).toBe(true);
    expect(response.user.schoolid).toBe("20370001");
    expect(getSession()?.user.name).toBe("张三");
    expect(response.persisted).toBe(true);
  });

  it("需要验证码时未填写抛 CAPTCHA_REQUIRED", async () => {
    stubFetch((url) => {
      if (url === SSO_LOGIN) return htmlResponse(loginPageWithCaptcha);
      if (url.startsWith(CAPTCHA)) {
        return new Response(Buffer.from("img"), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const preload = await preloadAuth();
    await expect(
      loginAuth({
        loginId: preload.loginId,
        username: "20370001",
        password: "secret",
      }),
    ).rejects.toMatchObject({ code: "CAPTCHA_REQUIRED" });
  });

  it("未知 loginId 抛 INVALID_REQUEST", async () => {
    await expect(loginAuth({ loginId: "missing" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });
});

describe("autoRelogin", () => {
  it("成功重登替换 Cookie 并标记待派生", async () => {
    assignSession(seedSession(), new CookieJar());

    stubFetch((url, init) => {
      if (url === SSO_LOGIN) {
        return init?.method === "POST"
          ? new Response("", { status: 200 })
          : htmlResponse(loginPageWithoutCaptcha);
      }
      if (url.startsWith(UC_LOGIN)) return new Response("", { status: 200 });
      if (url === UC_STATUS) return jsonResponse(ucUser);
      return new Response("not found", { status: 404 });
    });

    await expect(autoRelogin()).resolves.toEqual({ ok: true });
    const session = getSession();
    expect(session?.user.name).toBe("张三");
    expect(session?.authenticatedAt).not.toBe("2026-01-01T00:00:00.000Z");
    expect(["pending", "ready"]).toContain(session?.sources.byxt.status);
  });

  it("瞬时失败在冷却期内不重复请求", async () => {
    assignSession(seedSession(), new CookieJar());

    const mock = stubFetch(() => new Response("bad gateway", { status: 500 }));
    await expect(autoRelogin()).resolves.toMatchObject({
      ok: false,
      reason: "upstream",
    });

    const calls = mock.mock.calls.length;
    await expect(autoRelogin()).resolves.toMatchObject({
      ok: false,
      reason: "upstream",
    });
    expect(mock.mock.calls.length).toBe(calls);
  });

  it("无密码直接返回 no-password", async () => {
    assignSession(seedSession(null), new CookieJar());
    await expect(autoRelogin()).resolves.toEqual({
      ok: false,
      reason: "no-password",
    });
  });
});

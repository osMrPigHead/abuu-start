// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieJar } from "./cookieJar.ts";
import {
  assignSession,
  bykcToken,
  byxtCookieHeader,
  clearSession,
  currentGeneration,
  deleteDeriveFlight,
  deletePersistedCredentials,
  getDeriveFlight,
  markSourceExpired,
  pendingSources,
  requireSession,
  restoreSession,
  saveCurrentCredentials,
  setDeriveFlight,
  setSourceState,
  setStartupWarning,
  snapshot,
  startNewGeneration,
  ygdkCredentials,
} from "./state.ts";
import type { AuthSession } from "./types.ts";

let tempDir: string | null = null;

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    username: "20370001",
    password: "secret",
    user: { name: "张三", schoolid: "20370001" },
    authenticatedAt: "2026-01-01T00:00:00.000Z",
    cookies: [],
    spoc: { token: "spoc-token", roleCode: "01" },
    bykc: { token: "bykc-token" },
    ygdk: { uid: 1, token: "ygdk-token" },
    sources: pendingSources(),
    ...overrides,
  };
}

function readySources(): AuthSession["sources"] {
  const sources = pendingSources();
  for (const key of Object.keys(sources) as (keyof typeof sources)[]) {
    sources[key] = { status: "ready", updatedAt: null, error: null };
  }
  return sources;
}

beforeEach(() => {
  clearSession();
  startNewGeneration();
  setStartupWarning(null);
  vi.stubEnv("LOCALAPPDATA", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (tempDir !== null) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("auth state", () => {
  it("未登录时 requireSession 抛 AUTH_REQUIRED", () => {
    expect(() => requireSession()).toThrowError(
      expect.objectContaining({ code: "AUTH_REQUIRED" }),
    );
    expect(snapshot().authenticated).toBe(false);
  });

  it("状态迁移与快照深拷贝", () => {
    assignSession(
      makeSession({
        sources: {
          ...readySources(),
          byxt: { status: "ready", updatedAt: null, error: null },
        },
      }),
      new CookieJar(),
    );

    markSourceExpired("byxt");
    const current = requireSession();
    expect(current.sources.byxt.status).toBe("expired");
    expect(current.sources.byxt.error?.code).toBe("AUTH_EXPIRED");

    const snap = snapshot();
    snap.sources.byxt.error!.message = "changed";
    expect(requireSession().sources.byxt.error?.message).not.toBe("changed");
  });

  it("源状态决定凭据访问器错误码", () => {
    assignSession(makeSession(), new CookieJar());
    expect(() => bykcToken()).toThrowError(
      expect.objectContaining({ code: "SOURCE_BUSY" }),
    );

    setSourceState("bykc", "unconfigured", null);
    expect(() => bykcToken()).toThrowError(
      expect.objectContaining({ code: "AUTH_EXPIRED" }),
    );

    setSourceState("ygdk", "ready", null);
    expect(ygdkCredentials()).toEqual({ uid: 1, token: "ygdk-token" });
  });

  it("byxt Cookie 为空时标记过期并抛 AUTH_EXPIRED", () => {
    assignSession(makeSession({ sources: readySources() }), new CookieJar());
    expect(() => byxtCookieHeader()).toThrowError(
      expect.objectContaining({ code: "AUTH_EXPIRED" }),
    );
    expect(requireSession().sources.byxt.status).toBe("expired");
  });

  it("startNewGeneration 清空派生单飞表", () => {
    const promise = Promise.resolve(true);
    setDeriveFlight("byxt", { gen: currentGeneration(), promise });
    expect(getDeriveFlight("byxt")?.promise).toBe(promise);

    startNewGeneration();
    expect(getDeriveFlight("byxt")).toBeUndefined();
  });

  it("落盘与恢复保留会话字段", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "abuu-state-"));
    vi.stubEnv("LOCALAPPDATA", tempDir);

    assignSession(makeSession({ sources: readySources() }), new CookieJar());
    await expect(saveCurrentCredentials()).resolves.toBe(true);

    clearSession();
    await restoreSession();

    const restored = requireSession();
    expect(restored.username).toBe("20370001");
    expect(restored.password).toBe("secret");
    expect(restored.bykc).toEqual({ token: "bykc-token" });
    expect(snapshot().persisted).toBe(true);

    await expect(deletePersistedCredentials()).resolves.toEqual([]);
  });

  it("deleteDeriveFlight 只删除匹配的 Promise", () => {
    const first = Promise.resolve(true);
    const second = Promise.resolve(true);
    setDeriveFlight("spoc", { gen: currentGeneration(), promise: second });
    deleteDeriveFlight("spoc", first);
    expect(getDeriveFlight("spoc")?.promise).toBe(second);
  });
});

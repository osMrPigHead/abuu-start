// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RelayError } from "../core/errors.ts";
import { CookieJar } from "./cookieJar.ts";
import { deriveByxt, SourceDerivationError } from "./derive.ts";
import { deriveSource, waitForSource } from "./deriveRunner.ts";
import {
  assignSession,
  clearSession,
  pendingSources,
  requireSession,
  setStartupWarning,
  startNewGeneration,
} from "./state.ts";
import { saveCredentials } from "./store.ts";
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

const mockByxt = vi.mocked(deriveByxt);
const mockSave = vi.mocked(saveCredentials);

function makeSession(): AuthSession {
  return {
    username: "u",
    password: "p",
    user: { name: "n", schoolid: "u" },
    authenticatedAt: "2026-01-01T00:00:00.000Z",
    cookies: [],
    spoc: null,
    bykc: null,
    ygdk: null,
    sources: pendingSources(),
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  clearSession();
  startNewGeneration();
  setStartupWarning(null);
  assignSession(makeSession(), new CookieJar());
  mockByxt.mockReset();
  mockByxt.mockResolvedValue(undefined);
  mockSave.mockClear();
});

describe("deriveRunner", () => {
  it("成功派生写入 ready 并落盘", async () => {
    await expect(deriveSource("byxt")).resolves.toBe(true);

    expect(requireSession().sources.byxt.status).toBe("ready");
    expect(mockSave).toHaveBeenCalled();
  });

  it("同源并发复用同一个 Promise", async () => {
    const pending = deferred<void>();
    mockByxt.mockReturnValueOnce(pending.promise);

    const first = deriveSource("byxt");
    const second = deriveSource("byxt");

    expect(second).toBe(first);
    expect(mockByxt).toHaveBeenCalledTimes(1);

    pending.resolve();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("代际变化丢弃迟到结果", async () => {
    const pending = deferred<void>();
    mockByxt.mockReturnValueOnce(pending.promise);

    const flight = deriveSource("byxt");
    startNewGeneration();
    pending.resolve();

    await expect(flight).resolves.toBe(false);
    expect(requireSession().sources.byxt.status).toBe("pending");
  });

  it("派生失败写入 failed 与错误文案", async () => {
    mockByxt.mockRejectedValueOnce(new SourceDerivationError("boom"));

    await expect(deriveSource("byxt")).resolves.toBe(false);
    const state = requireSession().sources.byxt;
    expect(state.status).toBe("failed");
    expect(state.error).toEqual({
      code: "SOURCE_DERIVATION_FAILED",
      message: "boom",
    });
  });

  it("认证失效写入 expired", async () => {
    mockByxt.mockRejectedValueOnce(new RelayError("AUTH_EXPIRED", "expired"));

    await expect(deriveSource("byxt")).resolves.toBe(false);
    expect(requireSession().sources.byxt.status).toBe("expired");
  });

  it("waitForSource 等待进行中的派生", async () => {
    const pending = deferred<void>();
    mockByxt.mockReturnValueOnce(pending.promise);

    const flight = deriveSource("byxt");
    const waiting = waitForSource("byxt");

    pending.resolve();
    await flight;
    await waiting;

    expect(requireSession().sources.byxt.status).toBe("ready");
  });
});

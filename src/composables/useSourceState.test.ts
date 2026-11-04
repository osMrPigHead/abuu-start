import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import {
  createCachedDetailSource,
  createCachedSource,
} from "@/composables/useSourceState";
import type { SourceStatus } from "@/types";

type TestState = {
  status: SourceStatus;
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  hydrated: boolean;
  data: string | null;
};

function testState(): TestState {
  return {
    status: "idle",
    savedAt: null,
    error: null,
    loading: false,
    hydrated: false,
    data: null,
  };
}

function source(
  state: TestState,
  options: {
    cachedData?: string;
    fetch?: () => Promise<string>;
    clearData?: () => void;
    persist?: () => void;
  } = {},
) {
  let cacheReads = 0;
  const sourceController = createCachedSource({
    state,
    sourceId: "byxt",
    hydrateCache: () => {
      cacheReads += 1;
      if (options.cachedData === undefined) return false;
      state.data = options.cachedData;
      state.savedAt = "2026-03-02T08:00:00.000Z";
      return true;
    },
    clearData: options.clearData ?? (() => (state.data = null)),
    fetch: options.fetch ?? (async () => "fresh"),
    apply: (data) => {
      state.data = data;
    },
    persist: options.persist ?? (() => undefined),
    fallbackMessage: "加载失败",
  });

  return { sourceController, cacheReads: () => cacheReads };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createCachedSource", () => {
  it("hydrate 读取缓存并标记 cached", () => {
    const state = testState();
    const { sourceController, cacheReads } = source(state, {
      cachedData: "cached",
    });

    sourceController.hydrate();

    expect(cacheReads()).toBe(1);
    expect(state.hydrated).toBe(true);
    expect(state.status).toBe("cached");
    expect(state.data).toBe("cached");
  });

  it("refresh 成功时写 savedAt、状态与持久化", async () => {
    const state = testState();
    let persisted = 0;
    const { sourceController } = source(state, {
      fetch: async () => "fresh",
      persist: () => {
        persisted += 1;
      },
    });

    await sourceController.refresh();

    expect(state.status).toBe("ok");
    expect(state.data).toBe("fresh");
    expect(state.savedAt).not.toBeNull();
    expect(state.error).toBeNull();
    expect(state.loading).toBe(false);
    expect(persisted).toBe(1);
  });

  it("失败但有缓存时保留 cached 与错误", async () => {
    const state = testState();
    const { sourceController } = source(state, {
      cachedData: "cached",
      fetch: async () => {
        throw new ApiError("UPSTREAM_ERROR", "上游故障", 502);
      },
    });

    await sourceController.refresh();

    expect(state.status).toBe("cached");
    expect(state.data).toBe("cached");
    expect(state.error).toBe("上游故障");
    expect(state.loading).toBe(false);
  });

  it("失败且无缓存时清空业务字段", async () => {
    const state = testState();
    let cleared = 0;
    const { sourceController } = source(state, {
      clearData: () => {
        cleared += 1;
        state.data = null;
      },
      fetch: async () => {
        throw new ApiError("UPSTREAM_ERROR", "上游故障", 502);
      },
    });

    await sourceController.refresh();

    expect(state.status).toBe("error");
    expect(state.data).toBeNull();
    expect(state.savedAt).toBeNull();
    expect(cleared).toBeGreaterThanOrEqual(1);
  });

  it("AUTH_EXPIRED 映射为 auth-expired", async () => {
    const state = testState();
    const { sourceController } = source(state, {
      fetch: async () => {
        throw new ApiError("AUTH_EXPIRED", "登录已失效", 401);
      },
    });

    await sourceController.refresh();

    expect(state.status).toBe("auth-expired");
    expect(state.error).toBe("登录状态已失效，请到设置页重新登录");
  });

  it("reset 使进行中的请求失效", async () => {
    const state = testState();
    const deferred: { resolve: ((value: string) => void) | null } = {
      resolve: null,
    };
    const { sourceController } = source(state, {
      fetch: () =>
        new Promise<string>((resolve) => {
          deferred.resolve = resolve;
        }),
    });

    const refreshing = sourceController.refresh();
    sourceController.reset({ hydrated: true });
    deferred.resolve?.("stale");
    await refreshing;
    await settle();

    expect(state.status).toBe("idle");
    expect(state.data).toBeNull();
    expect(state.savedAt).toBeNull();
  });

  it("hasData 覆盖 savedAt 为空但业务数据存在的旧缓存", async () => {
    const state = testState();
    let cleared = 0;
    const sourceController = createCachedSource({
      state,
      sourceId: "byxt",
      hydrateCache: () => {
        state.data = "cached";
        state.savedAt = null;
        return true;
      },
      clearData: () => {
        cleared += 1;
        state.data = null;
      },
      fetch: async () => {
        throw new ApiError("UPSTREAM_ERROR", "上游故障", 502);
      },
      apply: () => undefined,
      persist: () => undefined,
      hasData: () => state.data !== null,
      fallbackMessage: "加载失败",
    });

    sourceController.hydrate();
    await sourceController.refresh();

    expect(state.status).toBe("cached");
    expect(state.data).toBe("cached");
    expect(cleared).toBe(0);
  });
});

type Preview = { id: string; title: string };
type Detail = { title: string };

type TestDetailState = {
  status: SourceStatus;
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  notFound: boolean;
  id: string | null;
  preview: Preview | null;
  detail: Detail | null;
};

function detailState(): TestDetailState {
  return {
    status: "idle",
    savedAt: null,
    error: null,
    loading: false,
    notFound: false,
    id: null,
    preview: null,
    detail: null,
  };
}

function detailSource(
  state: TestDetailState,
  fetch: (key: string) => Promise<Detail>,
) {
  let persisted = 0;
  const controller = createCachedDetailSource({
    state,
    sourceId: "bykc",
    accessors: {
      getKey: () => state.id,
      setKey: (key) => {
        state.id = key;
      },
      getPreview: () => state.preview,
      setPreview: (preview) => {
        state.preview = preview;
      },
      getDetail: () => state.detail,
      setDetail: (detail) => {
        state.detail = detail;
      },
    },
    openKey: (preview) => preview.id,
    isValidKey: (key) => key !== "bad",
    readCache: (key) =>
      key === "a"
        ? { savedAt: "2026-03-02T08:00:00.000Z", detail: { title: "cached" } }
        : null,
    fetch,
    apply: (detail) => {
      state.detail = detail;
    },
    persist: () => {
      persisted += 1;
    },
    fallbackMessage: "详情加载失败",
    notFoundMessage: "未找到详情",
    invalidKeyMessage: "无效详情",
  });

  return { controller, persisted: () => persisted };
}

describe("createCachedDetailSource", () => {
  it("先应用缓存再刷新为最新详情", async () => {
    const state = detailState();
    const { controller, persisted } = detailSource(state, async () => ({
      title: "fresh",
    }));

    controller.openById("a", { id: "a", title: "preview" });
    expect(state.status).toBe("cached");
    expect(state.detail).toEqual({ title: "cached" });

    await settle();
    expect(state.status).toBe("ok");
    expect(state.detail).toEqual({ title: "fresh" });
    expect(persisted()).toBe(1);
  });

  it("NOT_FOUND 保留 preview 并标记 notFound", async () => {
    const state = detailState();
    const { controller } = detailSource(state, async () => {
      throw new ApiError("NOT_FOUND", "不存在", 404);
    });

    controller.openById("a", { id: "a", title: "preview" });
    await settle();

    expect(state.notFound).toBe(true);
    expect(state.status).toBe("error");
    expect(state.preview).toEqual({ id: "a", title: "preview" });
    expect(state.detail).toEqual({ title: "cached" });
  });

  it("非法 key 不发请求", async () => {
    const state = detailState();
    let fetches = 0;
    const { controller } = detailSource(state, async () => {
      fetches += 1;
      return { title: "fresh" };
    });

    controller.openById("bad");
    await settle();

    expect(fetches).toBe(0);
    expect(state.notFound).toBe(true);
    expect(state.error).toBe("无效详情");
  });
});

/**
 * 单数据源与详情数据源的通用生命周期，见 docs/trd.md 7.6。
 * 负责“缓存优先 + 认证拦截 + loading/error/cached + 竞态 requestId”，
 * 业务字段读写与持久化由调用方通过回调提供。
 */
import { isAuthBlocked, markSourceExpired } from "@/composables/useAuth";
import type { AuthSourceId } from "@shared/auth";
import type { ApiErrorCode, SourceStatus } from "@/types";
import { mapApiError } from "@/api/errors";

export type SourceLifecycle = {
  status: SourceStatus;
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  hydrated: boolean;
};

export type CachedSourceOptions<T> = {
  state: SourceLifecycle;
  sourceId: AuthSourceId;
  /** 读缓存并写入业务字段；返回是否有可用缓存。 */
  hydrateCache: () => boolean;
  /** 清空业务字段（不含 lifecycle 的 status/savedAt/error/loading）。 */
  clearData: () => void;
  fetch: () => Promise<T>;
  apply: (data: T) => void;
  persist: () => void;
  /**
   * 是否存在可用缓存/已加载业务数据。
   * 默认看 `savedAt`；有业务字段的数据源应显式提供，避免旧缓存 savedAt 为空时误判。
   */
  hasData?: () => boolean;
  fallbackMessage: string;
  notFoundMessage?: string;
  messageOverrides?: Partial<Record<ApiErrorCode, string>>;
};

export type CachedSourceController = {
  hydrate: () => void;
  refresh: () => Promise<void>;
  reset: (options?: { hydrated?: boolean }) => void;
};

/**
 * 单数据源控制器。
 * 成功时由工厂统一写 `savedAt`、`status = "ok"` 并调用 `persist`。
 */
export function createCachedSource<T>(
  options: CachedSourceOptions<T>,
): CachedSourceController {
  const { state } = options;
  let requestId = 0;

  function hydrate(): void {
    if (state.hydrated) return;
    state.hydrated = true;

    if (!options.hydrateCache()) return;
    state.status = isAuthBlocked() ? "no-credential" : "cached";
  }

  async function refresh(): Promise<void> {
    hydrate();

    if (isAuthBlocked()) {
      state.status = "no-credential";
      state.error = null;
      state.loading = false;
      return;
    }

    const hadData = options.hasData
      ? options.hasData()
      : state.savedAt !== null;
    const currentRequest = ++requestId;

    state.loading = true;
    state.error = null;
    if (!hadData) {
      state.status = "loading";
    } else if (
      state.status === "no-credential" ||
      state.status === "auth-expired"
    ) {
      state.status = "cached";
    }

    try {
      const data = await options.fetch();
      if (currentRequest !== requestId) return;

      state.savedAt = new Date().toISOString();
      options.apply(data);
      state.status = "ok";
      state.error = null;
      state.loading = false;
      options.persist();
    } catch (error) {
      if (currentRequest !== requestId) return;

      const mapped = mapApiError(error, {
        fallback: options.fallbackMessage,
        notFoundMessage: options.notFoundMessage,
        messageOverrides: options.messageOverrides,
      });
      if (mapped.status === "auth-expired") {
        markSourceExpired(options.sourceId);
      }

      state.loading = false;
      state.error = mapped.message;

      if (hadData) {
        state.status = mapped.status === "error" ? "cached" : mapped.status;
      } else {
        state.status = mapped.status;
        options.clearData();
        state.savedAt = null;
      }
    }
  }

  function reset(resetOptions: { hydrated?: boolean } = {}): void {
    requestId += 1;
    options.clearData();
    state.status = "idle";
    state.savedAt = null;
    state.error = null;
    state.loading = false;
    state.hydrated = resetOptions.hydrated ?? false;
  }

  return { hydrate, refresh, reset };
}

export type DetailLifecycle = {
  status: SourceStatus;
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  notFound: boolean;
};

export type DetailAccessors<TKey, TPreview, TDetail> = {
  getKey: () => TKey | null;
  setKey: (key: TKey | null) => void;
  getPreview: () => TPreview | null;
  setPreview: (preview: TPreview | null) => void;
  getDetail: () => TDetail | null;
  setDetail: (detail: TDetail | null) => void;
};

export type CachedDetailSourceOptions<TKey, TPreview, TDetail> = {
  state: DetailLifecycle;
  sourceId: AuthSourceId;
  accessors: DetailAccessors<TKey, TPreview, TDetail>;
  openKey: (preview: TPreview) => TKey;
  isValidKey: (key: TKey) => boolean;
  readCache: (key: TKey) => { savedAt: string; detail: TDetail } | null;
  fetch: (key: TKey) => Promise<TDetail>;
  apply: (detail: TDetail) => void;
  persist: (key: TKey) => void;
  /** 是否存在可用详情缓存；默认看 `savedAt`。 */
  hasData?: () => boolean;
  fallbackMessage: string;
  notFoundMessage: string;
  invalidKeyMessage: string;
  messageOverrides?: Partial<Record<ApiErrorCode, string>>;
};

export type CachedDetailController<TKey, TPreview> = {
  open: (preview: TPreview) => void;
  openById: (key: TKey, preview?: TPreview | null) => void;
  refresh: () => Promise<void>;
  close: () => void;
};

export function createCachedDetailSource<TKey, TPreview, TDetail>(
  options: CachedDetailSourceOptions<TKey, TPreview, TDetail>,
): CachedDetailController<TKey, TPreview> {
  const { state, accessors } = options;
  let requestId = 0;

  function resetLifecycle(): void {
    state.status = "idle";
    state.savedAt = null;
    state.error = null;
    state.loading = false;
    state.notFound = false;
  }

  function openWithKey(key: TKey, preview: TPreview | null): void {
    requestId += 1;

    accessors.setKey(key);
    accessors.setPreview(preview);
    accessors.setDetail(null);
    resetLifecycle();

    if (!options.isValidKey(key)) {
      state.notFound = true;
      state.status = "error";
      state.error = options.invalidKeyMessage;
      return;
    }

    const cache = options.readCache(key);
    if (cache) {
      accessors.setDetail(cache.detail);
      state.savedAt = cache.savedAt || null;
      state.status = isAuthBlocked() ? "no-credential" : "cached";
    }

    void refresh();
  }

  function open(preview: TPreview): void {
    openWithKey(options.openKey(preview), preview);
  }

  function openById(key: TKey, preview: TPreview | null = null): void {
    openWithKey(key, preview);
  }

  async function refresh(): Promise<void> {
    const key = accessors.getKey();
    if (key === null || !options.isValidKey(key)) return;

    if (isAuthBlocked()) {
      state.status = "no-credential";
      state.error = null;
      state.loading = false;
      return;
    }

    const hadData = options.hasData
      ? options.hasData()
      : state.savedAt !== null;
    const currentRequest = ++requestId;

    state.loading = true;
    state.error = null;
    state.notFound = false;
    if (!hadData) {
      state.status = "loading";
    } else if (
      state.status === "no-credential" ||
      state.status === "auth-expired"
    ) {
      state.status = "cached";
    }

    try {
      const detail = await options.fetch(key);
      if (currentRequest !== requestId || accessors.getKey() !== key) return;

      state.savedAt = new Date().toISOString();
      options.apply(detail);
      state.status = "ok";
      state.error = null;
      state.loading = false;
      options.persist(key);
    } catch (error) {
      if (currentRequest !== requestId || accessors.getKey() !== key) return;

      const mapped = mapApiError(error, {
        fallback: options.fallbackMessage,
        notFoundMessage: options.notFoundMessage,
        messageOverrides: options.messageOverrides,
      });
      if (mapped.status === "auth-expired") {
        markSourceExpired(options.sourceId);
      }

      state.loading = false;
      state.error = mapped.message;

      if (mapped.notFound) {
        state.notFound = true;
        state.status = "error";
        return;
      }

      if (hadData) {
        state.status = mapped.status === "error" ? "cached" : mapped.status;
      } else {
        state.status = mapped.status;
        accessors.setDetail(null);
        state.savedAt = null;
      }
    }
  }

  function close(): void {
    requestId += 1;
    accessors.setKey(null);
    accessors.setPreview(null);
    accessors.setDetail(null);
    resetLifecycle();
  }

  return { open, openById, refresh, close };
}

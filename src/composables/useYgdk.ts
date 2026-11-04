/** 阳光打卡概览：缓存优先、独立数据源状态，见 docs/trd-phase2.md 7.4 / 7.6。 */
import { reactive } from "vue";
import { fetchYgdkOverview } from "@/api/ygdk";
import { createCachedSource } from "@/composables/useSourceState";
import type { YgdkOverview } from "@shared/api";
import type { SourceStatus, YgdkOverviewCache } from "@/types";
import { isRecord } from "@/utils/guards";
import {
  clearYgdkCaches,
  readJson,
  STORAGE_KEYS,
  writeJson,
} from "@/cache/storage";

type YgdkState = {
  status: SourceStatus;
  overview: YgdkOverview | null;
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  hydrated: boolean;
};

const state = reactive<YgdkState>({
  status: "idle",
  overview: null,
  savedAt: null,
  error: null,
  loading: false,
  hydrated: false,
});

const source = createCachedSource({
  state,
  sourceId: "ygdk",
  hydrateCache: hydrateCache,
  clearData: clearData,
  fetch: () => fetchYgdkOverview(),
  apply: (overview) => {
    state.overview = overview;
  },
  persist: persistOverview,
  hasData: () => state.overview !== null || state.savedAt !== null,
  fallbackMessage: "阳光打卡概览加载失败",
});

export function useYgdk() {
  hydrate();

  return {
    state,
    hydrate,
    refresh,
    clearYgdkData,
  };
}

function hydrate(): void {
  source.hydrate();
}

async function refresh(): Promise<void> {
  await source.refresh();
}

function hydrateCache(): boolean {
  const cache = readOverviewCache();
  if (!cache) return false;

  state.overview = cache.overview;
  state.savedAt = cache.savedAt;
  return true;
}

function clearData(): void {
  state.overview = null;
}

function clearYgdkData(): void {
  clearYgdkCaches();
  source.reset({ hydrated: true });
}

/* ------------------------------- 缓存读写 ------------------------------- */

function readOverviewCache(): YgdkOverviewCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.ygdkOverviewCache);
  if (!isRecord(raw)) return null;

  const overview = normalizeOverview(raw.overview);
  if (!overview) return null;

  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  return { savedAt, overview };
}

function persistOverview(): void {
  if (!state.overview || state.savedAt === null) return;

  writeJson(STORAGE_KEYS.ygdkOverviewCache, {
    savedAt: state.savedAt,
    overview: state.overview,
  } satisfies YgdkOverviewCache);
}

/* ------------------------------- 归一化 ------------------------------- */

function normalizeOverview(value: unknown): YgdkOverview | null {
  if (!isRecord(value)) return null;

  return {
    termName:
      typeof value.termName === "string" && value.termName.trim().length > 0
        ? value.termName.trim()
        : null,
    termCount: readCount(value.termCount),
    termTarget: readCount(value.termTarget),
    weekCount: readCount(value.weekCount),
    weekTarget: readCount(value.weekTarget),
  };
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

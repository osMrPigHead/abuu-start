/** 阳光打卡概览：缓存优先、独立数据源状态，见 docs/trd.md 8.4 / 7.7。 */
import { reactive } from "vue";
import { fetchYgdkOverview } from "@/api/ygdk";
import { createCachedSource } from "@/composables/useSourceState";
import type { YgdkOverview } from "@shared/api";
import type { SourceStatus } from "@/types";
import { readYgdkOverviewCache, writeYgdkOverviewCache } from "@/cache/ygdk";
import { clearYgdkCaches } from "@/cache/storage";

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
  const cache = readYgdkOverviewCache();
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

function persistOverview(): void {
  if (!state.overview || state.savedAt === null) return;

  writeYgdkOverviewCache({
    savedAt: state.savedAt,
    overview: state.overview,
  });
}

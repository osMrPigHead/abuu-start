/** 阳光打卡概览缓存读写与归一化，见 docs/trd-phase2.md 7.4。 */
import type { YgdkOverview } from "@shared/api";
import type { YgdkOverviewCache } from "@/types";
import { isRecord, nullableText } from "@/utils/guards";
import { readJson, STORAGE_KEYS, writeJson } from "@/cache/storage";

export function readYgdkOverviewCache(): YgdkOverviewCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.ygdkOverviewCache);
  if (!isRecord(raw)) return null;

  const overview = normalizeOverview(raw.overview);
  if (!overview) return null;

  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  return { savedAt, overview };
}

export function writeYgdkOverviewCache(cache: YgdkOverviewCache): void {
  writeJson(STORAGE_KEYS.ygdkOverviewCache, cache);
}

function normalizeOverview(value: unknown): YgdkOverview | null {
  if (!isRecord(value)) return null;

  return {
    termName: nullableText(value.termName),
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

/** 数据源同步状态文案与操作判定，口径见 docs/ui-lowfi.md 同步状态。 */
import type { SourceStatus } from "@/types";
import { formatStamp } from "@/utils/date";

export type SourceBadgeState = {
  status: SourceStatus;
  savedAt: string | null;
  loading: boolean;
  error: string | null;
};

type SourceBadgeInput = Pick<
  SourceBadgeState,
  "status" | "savedAt" | "loading"
>;

/** 缓存标签：有保存时间时精确到分钟，否则退回“缓存”。 */
export function cacheBadge(savedAt: string | null): string {
  const stamp = formatStamp(savedAt);
  return stamp ? `缓存于 ${stamp}` : "缓存";
}

/**
 * 单个数据源的标题标签。
 * 优先级：已失效 > 未登录 > 加载失败 > 同步中 > 缓存于 > 已同步 > 待接入。
 */
export function resolveSourceBadge(state: SourceBadgeInput): string {
  switch (state.status) {
    case "auth-expired":
      return "已失效";
    case "no-credential":
      return "未登录";
    case "error":
      return "加载失败";
    default:
      break;
  }

  if (state.loading || state.status === "loading") return "同步中";

  switch (state.status) {
    case "cached":
      return cacheBadge(state.savedAt);
    case "ok":
      return "已同步";
    default:
      return "待接入";
  }
}

/**
 * 多个数据源的聚合标签（日程卡片）。
 * 优先级：已失效 > 未登录 > 加载失败 > 同步中 > 缓存（取最早时间）> 已同步 / 待接入。
 */
export function resolveAggregateSourceBadge(
  sources: readonly SourceBadgeInput[],
): string {
  if (sources.length === 0) return "待接入";
  if (sources.some((source) => source.status === "auth-expired"))
    return "已失效";
  if (sources.some((source) => source.status === "no-credential"))
    return "未登录";
  if (sources.some((source) => source.status === "error")) return "加载失败";
  if (sources.some((source) => source.loading || source.status === "loading"))
    return "同步中";

  if (sources.some((source) => source.status === "cached")) {
    const earliest = sources
      .map((source) => source.savedAt)
      .filter((value): value is string => value !== null && value.length > 0)
      .sort()[0];
    return cacheBadge(earliest ?? null);
  }

  return sources.every((source) => source.status === "ok")
    ? "已同步"
    : "待接入";
}

/** 失败且可重试：无缓存的加载失败，或保留缓存但带错误。 */
export function canRetrySource(
  state: Pick<SourceBadgeState, "status" | "error">,
): boolean {
  return (
    state.status === "error" ||
    (state.status === "cached" && state.error !== null)
  );
}

/** 无凭据或凭据失效时需要引导到设置页。 */
export function needsSettingsSource(
  state: Pick<SourceBadgeState, "status">,
): boolean {
  return state.status === "no-credential" || state.status === "auth-expired";
}

export type SourceCardState = {
  badge: string;
  canRetry: boolean;
  needsSettings: boolean;
};

/** 主页卡片标题右上角的状态三件套，避免每张卡片各算一遍。 */
export function sourceCardState(state: SourceBadgeState): SourceCardState {
  return {
    badge: resolveSourceBadge(state),
    canRetry: canRetrySource(state),
    needsSettings: needsSettingsSource(state),
  };
}

export type SourceTextLabels = {
  noCredential: string;
  authExpired: string;
  fallback: string;
};

/** 同步状态行文案；与 `SourceStatusLine` 的展示口径一致。 */
export function resolveSourceText(
  state: Pick<SourceBadgeState, "status" | "savedAt" | "error"> & {
    refreshing?: boolean;
  },
  labels: SourceTextLabels,
): string {
  const time = formatStamp(state.savedAt);
  const cachedText = time ? `缓存于 ${time}` : "缓存数据";
  const refreshingSuffix = state.refreshing ? " · 正在刷新…" : "";

  switch (state.status) {
    case "no-credential":
      return time
        ? `${cachedText} · ${labels.noCredential}`
        : labels.noCredential;
    case "auth-expired":
      return time
        ? `${cachedText} · ${labels.authExpired}`
        : labels.authExpired;
    case "error":
      return state.error || labels.fallback;
    case "loading":
      return time ? `${cachedText} · 正在刷新…` : "正在加载…";
    case "cached":
      return `${cachedText}${refreshingSuffix}`;
    case "ok":
      return `${time ? `已同步 ${time}` : "已同步"}${refreshingSuffix}`;
    default:
      return "等待加载";
  }
}

export type SourcePlaceholderLabels = {
  loading: string;
  noCredential: string;
  authExpired: string;
  error: string;
  empty: string;
};

/** 卡片空态文案：加载/未登录/失效/错误优先，其余回退到“暂无”文案。 */
export function resolveSourcePlaceholder(
  state: Pick<SourceBadgeState, "status" | "error">,
  labels: SourcePlaceholderLabels,
): string {
  switch (state.status) {
    case "loading":
      return labels.loading;
    case "no-credential":
      return labels.noCredential;
    case "auth-expired":
      return labels.authExpired;
    case "error":
      return state.error || labels.error;
    default:
      return labels.empty;
  }
}

/**
 * 阳光打卡业务层：概览归一化，见 docs/api.md 4、docs/trd-phase2.md 3.2 / 3.3。
 *
 * 只读接口：Classify/getList → Clockin/getCount → Term/get（可选）。
 * 不调用 Item/getList、Clockin/getList、Upload/File/post、Clockin/clockin。
 * 协议、URL 与信封判定在 upstreams/ygdkApi.ts。
 */
import { ygdkCredentials as sessionYgdkCredentials } from "../auth/session.ts";
import { RelayError } from "../core/errors.ts";
import { isRecord, readInteger } from "../core/guards.ts";
import { fetchYgdk, type YgdkCredentials } from "../upstreams/ygdkApi.ts";
import type { YgdkOverview } from "../../shared/api.ts";

const UID_RE = /^\d{1,15}$/;

type YgdkClassify = {
  classifyId: number;
  name: string;
  termNum: number | null;
  weekNum: number | null;
};

type YgdkCount = {
  termCount: number | null;
  termCountShow: number | null;
  termGoodCount: number | null;
  termGoodCountShow: number | null;
  weekCount: number | null;
  weekNum: number | null;
  termNum: number | null;
};

/** 阳光概览：学期次数/目标 + 当周次数/系统周限制，见 docs/trd-phase2.md 3.2。 */
export async function ygdkOverview(): Promise<YgdkOverview> {
  const credentials = requireYgdkCredentials();
  const classify = await fetchClassify(credentials);
  const count = await fetchCount(credentials, classify.classifyId);
  const termName = await fetchTermName(credentials);

  return {
    termName,
    termCount:
      firstInteger([
        count.termGoodCountShow,
        count.termGoodCount,
        count.termCountShow,
        count.termCount,
      ]) ?? 0,
    termTarget: firstInteger([count.termNum, classify.termNum]) ?? 0,
    weekCount: count.weekCount ?? 0,
    weekTarget: firstInteger([count.weekNum, classify.weekNum]) ?? 0,
  };
}

/** 从认证会话取 uid/token；uid 必须是十进制整数。 */
function requireYgdkCredentials(): YgdkCredentials {
  const stored = sessionYgdkCredentials();
  const uid = String(stored.uid);

  if (!UID_RE.test(uid)) {
    throw new RelayError("INVALID_REQUEST", "阳光打卡 UID 必须是十进制整数");
  }

  return { uid, token: stored.token };
}

/** 分类：名称含“体育”优先，其次 classify_id === 1，最后取第一项。 */
async function fetchClassify(
  credentials: YgdkCredentials,
): Promise<YgdkClassify> {
  const payload = await fetchYgdk(
    credentials,
    "/Front/Clockin/Classify/getList",
  );
  const list =
    isRecord(payload) && Array.isArray(payload.list) ? payload.list : [];
  const items = list
    .map(normalizeClassify)
    .filter((item): item is YgdkClassify => item !== null);

  const picked =
    items.find((item) => item.name.includes("体育")) ??
    items.find((item) => item.classifyId === 1) ??
    items[0];

  if (!picked) {
    throw new RelayError("UPSTREAM_ERROR", "未获取到阳光打卡分类");
  }

  return picked;
}

async function fetchCount(
  credentials: YgdkCredentials,
  classifyId: number,
): Promise<YgdkCount> {
  const payload = await fetchYgdk(
    credentials,
    "/Front/Clockin/Clockin/getCount",
    {
      classify_id: String(classifyId),
      user_id: credentials.uid,
    },
  );

  if (!isRecord(payload)) {
    throw new RelayError("BAD_RESPONSE", "阳光打卡次数响应异常");
  }

  return {
    termCount: readInteger(payload.term_count),
    termCountShow: readInteger(payload.term_count_show),
    termGoodCount: readInteger(payload.term_good_count),
    termGoodCountShow: readInteger(payload.term_good_count_show),
    weekCount: readInteger(payload.week_count),
    weekNum: readInteger(payload.week_num),
    termNum: readInteger(payload.term_num),
  };
}

/** 学期名是可选字段；失败不阻塞概览。 */
async function fetchTermName(
  credentials: YgdkCredentials,
): Promise<string | null> {
  try {
    const payload = await fetchYgdk(credentials, "/Front/Clockin/Term/get");
    if (!isRecord(payload)) return null;

    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

function normalizeClassify(value: unknown): YgdkClassify | null {
  if (!isRecord(value)) return null;

  const classifyId = readInteger(value.classify_id);
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (classifyId === null || name.length === 0) return null;

  return {
    classifyId,
    name,
    termNum: readInteger(value.term_num),
    weekNum: readInteger(value.week_num),
  };
}

function firstInteger(
  values: readonly (number | null | undefined)[],
): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  }
  return null;
}

/**
 * 统一认证成功后的四源派生，见 docs/api.md 2.3、docs/trd.md 6.3。
 *
 * 协议构造与信封读取在 upstreams/*Api.ts；本模块只做「拿凭据 + 校验」，
 * 不归一化业务数据，避免 auth → sources → auth 的循环依赖。
 */
import { isRecord, readInteger } from "../core/guards.ts";
import {
  readClassifyId,
  readRawQueryParam,
  readRawString,
  readRoleCode,
} from "./deriveHelpers.ts";
import { buildBykcCall, readBykcPayload } from "../upstreams/bykcApi.ts";
import { buildByxtRequest, isByxtSuccess } from "../upstreams/byxtApi.ts";
import { buildSpocRequest, readSpocEnvelope } from "../upstreams/spocApi.ts";
import { buildYgdkForm, readYgdkResult } from "../upstreams/ygdkApi.ts";
import {
  BYKC_BASE_URL,
  BYKC_ORIGIN,
  BYXT_ORIGIN,
  SPOC_BASE_URL,
  SPOC_TERM_PARAM,
  YGDK_BASE_URL,
  YGDK_OAUTH_URL,
} from "../upstreams/urls.ts";
import { requestWithJar, type JarResult } from "./http.ts";
import type { CookieJar } from "./cookieJar.ts";
import type {
  BykcCredential,
  SpocCredential,
  YgdkCredential,
} from "./types.ts";

const DERIVE_TIMEOUT_MS = 12_000;

/** 单源派生失败；只影响该源，不阻塞整体。 */
export class SourceDerivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceDerivationError";
  }
}

export async function deriveByxt(jar: CookieJar): Promise<void> {
  if (await tryByxtCurrentUser(jar)) return;

  // docs/api.md 2.3.1：拿不到 Cookie 时先访问一次 byxt 首页触发票据交换。
  try {
    await requestWithJar(
      jar,
      BYXT_ORIGIN,
      {},
      {
        maxRedirects: 10,
        timeoutMs: DERIVE_TIMEOUT_MS,
      },
    );
  } catch {
    // 首页兜底失败时继续重试 currentUser，最终统一按派生失败处理。
  }

  if (await tryByxtCurrentUser(jar)) return;
  throw new SourceDerivationError("本研教育管理系统派生失败");
}

export async function deriveSpoc(jar: CookieJar): Promise<SpocCredential> {
  try {
    const token = await acquireSpocToken(jar);
    const roleCode = await loginSpoc(jar, token);
    await validateSpoc(jar, token, roleCode);
    return { token, roleCode };
  } catch (error) {
    if (error instanceof SourceDerivationError) throw error;
    throw new SourceDerivationError("SPOC 派生失败");
  }
}

export async function deriveBykc(jar: CookieJar): Promise<BykcCredential> {
  try {
    const token = await acquireBykcToken(jar);
    await validateBykc(jar, token);
    return { token };
  } catch (error) {
    if (error instanceof SourceDerivationError) throw error;
    throw new SourceDerivationError("博雅派生失败");
  }
}

export async function deriveYgdk(jar: CookieJar): Promise<YgdkCredential> {
  try {
    const code = await acquireYgdkCode(jar);
    const credential = await loginYgdk(jar, code);
    await validateYgdk(jar, credential);
    return credential;
  } catch (error) {
    if (error instanceof SourceDerivationError) throw error;
    throw new SourceDerivationError("阳光打卡派生失败");
  }
}

/* --------------------------------- byxt --------------------------------- */

async function tryByxtCurrentUser(jar: CookieJar): Promise<boolean> {
  try {
    const built = buildByxtRequest("api/home/currentUser.do");
    const result = await requestWithJar(jar, built.url, built.init, {
      maxRedirects: 10,
      timeoutMs: DERIVE_TIMEOUT_MS,
    });

    if (result.status < 200 || result.status >= 300) return false;
    if (result.url.includes("sso.buaa.edu.cn")) return false;
    return isByxtSuccess(result);
  } catch {
    return false;
  }
}

/* --------------------------------- SPOC --------------------------------- */

async function acquireSpocToken(jar: CookieJar): Promise<string> {
  let result: JarResult;
  try {
    result = await requestWithJar(
      jar,
      `${SPOC_BASE_URL}cas`,
      {},
      {
        maxRedirects: 8,
        timeoutMs: DERIVE_TIMEOUT_MS,
      },
    );
  } catch {
    throw new SourceDerivationError("SPOC 派生失败");
  }

  for (const url of result.visited) {
    if (!url.includes("/spocnew/cas")) continue;
    const token = readRawQueryParam(url, "token");
    if (token !== null) return token;
  }

  throw new SourceDerivationError("SPOC 派生失败");
}

async function loginSpoc(jar: CookieJar, token: string): Promise<string> {
  const built = buildSpocRequest({ token: `Inco-${token}` }, "sys/casLogin", {
    method: "POST",
    body: { token },
  });
  const result = await requestWithJar(jar, built.url, built.init, {
    maxRedirects: 0,
    timeoutMs: DERIVE_TIMEOUT_MS,
  });

  const content = readSpocEnvelope<unknown>(result);
  const roleCode = readRoleCode(content);
  if (roleCode === null) {
    throw new SourceDerivationError("SPOC 派生失败");
  }

  return roleCode;
}

async function validateSpoc(
  jar: CookieJar,
  token: string,
  roleCode: string,
): Promise<void> {
  const built = buildSpocRequest(
    { token: `Inco-${token}`, roleCode },
    "inco/ht/queryOne",
    {
      method: "POST",
      body: { param: SPOC_TERM_PARAM },
    },
  );
  const result = await requestWithJar(jar, built.url, built.init, {
    maxRedirects: 0,
    timeoutMs: DERIVE_TIMEOUT_MS,
  });

  readSpocEnvelope<unknown>(result);
}

/* --------------------------------- 博雅 --------------------------------- */

async function acquireBykcToken(jar: CookieJar): Promise<string> {
  const token = await findBykcToken(jar);
  if (token !== null) return token;

  // docs/api.md 2.3.3：拿不到 token 时访问一次 cas-login 兜底（忽略结果）。
  try {
    await requestWithJar(
      jar,
      `${BYKC_ORIGIN}/cas-login?token=`,
      {},
      {
        maxRedirects: 10,
        timeoutMs: DERIVE_TIMEOUT_MS,
      },
    );
  } catch {
    // 兜底请求失败不影响最终判定。
  }

  const retried = await findBykcToken(jar);
  if (retried !== null) return retried;

  throw new SourceDerivationError("博雅派生失败");
}

async function findBykcToken(jar: CookieJar): Promise<string | null> {
  let result: JarResult;
  try {
    result = await requestWithJar(
      jar,
      `${BYKC_BASE_URL}cas/login`,
      {},
      {
        maxRedirects: 10,
        timeoutMs: DERIVE_TIMEOUT_MS,
      },
    );
  } catch {
    return null;
  }

  for (const url of result.visited) {
    const token = readRawQueryParam(url, "token");
    if (token !== null) return token;
  }

  return null;
}

async function validateBykc(jar: CookieJar, token: string): Promise<void> {
  const call = buildBykcCall(token, "getUserProfile", {});
  const result = await requestWithJar(jar, call.url, call.init, {
    maxRedirects: 0,
    timeoutMs: DERIVE_TIMEOUT_MS,
  });

  readBykcPayload(result, call.aesKey);
}

/* --------------------------------- 阳光 --------------------------------- */

async function acquireYgdkCode(jar: CookieJar): Promise<string> {
  let result: JarResult;
  try {
    result = await requestWithJar(
      jar,
      YGDK_OAUTH_URL,
      {},
      {
        maxRedirects: 10,
        timeoutMs: DERIVE_TIMEOUT_MS,
      },
    );
  } catch {
    throw new SourceDerivationError("阳光打卡派生失败");
  }

  for (const url of result.visited) {
    const code = readRawQueryParam(url, "code");
    if (code !== null) return code;
  }

  throw new SourceDerivationError("阳光打卡派生失败");
}

async function loginYgdk(
  jar: CookieJar,
  code: string,
): Promise<YgdkCredential> {
  const url = new URL(`${YGDK_BASE_URL}/Front/Clockin/User/campusAppLogin`);
  url.searchParams.set("code", code);

  const result = await requestWithJar(
    jar,
    url.toString(),
    {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    },
    { maxRedirects: 0, timeoutMs: DERIVE_TIMEOUT_MS },
  );

  const payload = readYgdkResult(result);
  const record = isRecord(payload) ? payload : {};
  const data = isRecord(record.data) ? record.data : record;

  const uid = readInteger(data.uid);
  const token = readRawString(data.token);
  if (uid === null || token === null) {
    throw new SourceDerivationError("阳光打卡派生失败");
  }

  return { uid, token };
}

async function validateYgdk(
  jar: CookieJar,
  credential: YgdkCredential,
): Promise<void> {
  const classify = await requestYgdkFormFromJar(
    jar,
    "/Front/Clockin/Classify/getList",
    credential,
  );
  const list =
    isRecord(classify) && Array.isArray(classify.list) ? classify.list : [];
  const classifyId = readClassifyId(list);

  await requestYgdkFormFromJar(
    jar,
    "/Front/Clockin/Clockin/getCount",
    credential,
    {
      classify_id: String(classifyId ?? 1),
      user_id: String(credential.uid),
    },
  );
}

async function requestYgdkFormFromJar(
  jar: CookieJar,
  path: string,
  credential: YgdkCredential,
  form: Record<string, string> = {},
): Promise<unknown> {
  const built = buildYgdkForm(
    { uid: String(credential.uid), token: credential.token },
    path,
    form,
  );
  const result = await requestWithJar(jar, built.url, built.init, {
    maxRedirects: 0,
    timeoutMs: DERIVE_TIMEOUT_MS,
  });

  return readYgdkResult(result);
}

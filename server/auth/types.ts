/**
 * 中继内部类型：会话、凭据文件与登录尝试，字段口径见 docs/trd.md 4.2 / 5.1。
 * 与前端共享的认证契约见 shared/auth.ts。
 */
import type { CookieJar } from "./cookieJar.ts";
import type {
  AuthSourceId,
  AuthSourceState,
  AuthSources,
  AuthUser,
} from "../../shared/auth.ts";

export type StoredCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresAt: number | null;
  secure: boolean;
  httpOnly: boolean;
  hostOnly: boolean;
};

export type SpocCredential = {
  token: string;
  roleCode: string;
};

export type BykcCredential = {
  token: string;
};

export type YgdkCredential = {
  uid: number;
  token: string;
};

export type AuthSession = {
  username: string;
  password: string | null;
  user: AuthUser;
  authenticatedAt: string;
  cookies: StoredCookie[];
  spoc: SpocCredential | null;
  bykc: BykcCredential | null;
  ygdk: YgdkCredential | null;
  sources: AuthSources;
};

/** 一次登录尝试：只在内存中，默认 10 分钟，最多 5 个。 */
export type LoginAttempt = {
  id: string;
  jar: CookieJar;
  execution: string | null;
  captchaId: string | null;
  hidden: Record<string, string>;
  alreadyLoggedIn: boolean;
  createdAt: number;
};

/** credentials.enc 的明文结构，见 docs/trd.md 4.2。 */
export type CredentialFile = {
  version: 1;
  username: string;
  password: string | null;
  user: AuthUser;
  authenticatedAt: string;
  cookies: StoredCookie[];
  spoc: SpocCredential | null;
  bykc: BykcCredential | null;
  ygdk: YgdkCredential | null;
  sources: Record<AuthSourceId, Pick<AuthSourceState, "status" | "updatedAt">>;
};

/** credentials.enc 的密文信封。 */
export type CredentialEnvelope = {
  version: 1;
  alg: "AES-256-GCM";
  iv: string;
  tag: string;
  data: string;
};

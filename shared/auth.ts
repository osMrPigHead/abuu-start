/**
 * 前端与本地中继共用的认证契约，字段口径见 docs/trd-phase3.md 3.2 / 4.2 / 5.1。
 * 凭据文件、Cookie 与会话结构只属于中继，不在此处。
 */

export const AUTH_SOURCE_IDS = ["byxt", "spoc", "bykc", "ygdk"] as const;

export type AuthSourceId = (typeof AUTH_SOURCE_IDS)[number];

export type AuthSourceStatus =
  "unconfigured" | "pending" | "ready" | "failed" | "expired";

export type AuthSourceError = {
  code: string;
  message: string;
};

export type AuthSourceState = {
  status: AuthSourceStatus;
  updatedAt: string | null;
  error: AuthSourceError | null;
};

export type AuthUser = {
  name: string;
  schoolid: string;
};

export type AuthSources = Record<AuthSourceId, AuthSourceState>;

export const AUTH_SOURCE_LABELS: Record<AuthSourceId, string> = {
  byxt: "本研教育管理系统",
  spoc: "SPOC",
  bykc: "博雅课程",
  ygdk: "阳光打卡",
};

export type AuthStatusResponse = {
  authenticated: boolean;
  user: AuthUser | null;
  authenticatedAt: string | null;
  persisted: boolean;
  deriving: boolean;
  sources: AuthSources;
  warning?: string;
};

export type AuthPreloadResponse = {
  loginId: string;
  captchaRequired: boolean;
  captcha?: {
    image: string;
    expiresAt: string;
  };
  alreadyLoggedIn: boolean;
};

export type AuthLoginResponse = {
  authenticated: true;
  user: AuthUser;
  authenticatedAt: string;
  persisted: boolean;
  sources: AuthSources;
  warning?: string;
};

export type AuthSourceRetryResponse = {
  source: AuthSourceId;
  status: AuthSourceStatus;
  updatedAt: string | null;
  error: AuthSourceError | null;
};

export type AuthLogoutResponse = {
  ok: true;
  warning?: string;
};

export function isAuthSourceId(value: string): value is AuthSourceId {
  return (AUTH_SOURCE_IDS as readonly string[]).includes(value);
}

export function emptyAuthSourceState(): AuthSourceState {
  return { status: "unconfigured", updatedAt: null, error: null };
}

export function emptyAuthSources(): AuthSources {
  return {
    byxt: emptyAuthSourceState(),
    spoc: emptyAuthSourceState(),
    bykc: emptyAuthSourceState(),
    ygdk: emptyAuthSourceState(),
  };
}

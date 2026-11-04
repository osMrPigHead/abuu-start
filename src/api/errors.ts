/** 数据源错误到 UI 状态/文案的统一映射。 */
import { ApiError } from "@/api/client";
import type { ApiErrorCode, SourceStatus } from "@/types";

export type MappedSourceError = {
  status: SourceStatus;
  message: string;
  notFound?: boolean;
};

const NO_CREDENTIAL_MESSAGE = "未登录，请前往设置完成登录";
const AUTH_EXPIRED_MESSAGE = "登录状态已失效，请到设置页重新登录";
const SOURCE_BUSY_MESSAGE = "数据源正在派生，请稍后重试";

type MapApiErrorOptions = {
  fallback: string;
  /** `NOT_FOUND` 时的固定文案；不传时回退到上游 message/fallback。 */
  notFoundMessage?: string;
  /** 某些接口需要覆盖上游 message 的固定文案。 */
  messageOverrides?: Partial<Record<ApiErrorCode, string>>;
};

/**
 * 统一处理认证、派生与未找到错误。
 * 未识别的错误保留上游 message；没有 message 时使用调用方 fallback。
 */
export function mapApiError(
  error: unknown,
  options: MapApiErrorOptions,
): MappedSourceError {
  if (!(error instanceof ApiError)) {
    return { status: "error", message: options.fallback };
  }

  switch (error.code) {
    case "NO_CREDENTIAL":
    case "AUTH_REQUIRED":
      return { status: "no-credential", message: NO_CREDENTIAL_MESSAGE };
    case "AUTH_EXPIRED":
      return { status: "auth-expired", message: AUTH_EXPIRED_MESSAGE };
    case "SOURCE_BUSY":
      return { status: "error", message: SOURCE_BUSY_MESSAGE };
    case "NOT_FOUND":
      return {
        status: "error",
        message: options.notFoundMessage ?? (error.message || options.fallback),
        notFound: true,
      };
    default:
      return {
        status: "error",
        message:
          options.messageOverrides?.[error.code] ??
          (error.message || options.fallback),
      };
  }
}

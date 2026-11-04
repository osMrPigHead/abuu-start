// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RelayError,
  toErrorBody,
  toRelayError,
  toUpstreamRelayError,
} from "./errors.ts";

describe("relay errors", () => {
  it("RelayError 映射 HTTP 状态", () => {
    expect(new RelayError("AUTH_EXPIRED", "expired").status).toBe(401);
    expect(new RelayError("SOURCE_BUSY", "busy").status).toBe(409);
    expect(new RelayError("UPSTREAM_TIMEOUT", "timeout").status).toBe(504);
    expect(new RelayError("INTERNAL", "internal").status).toBe(500);
  });

  it("toRelayError 透传 RelayError，其余转 INTERNAL", () => {
    const original = new RelayError("BAD_RESPONSE", "bad");
    expect(toRelayError(original)).toBe(original);

    const converted = toRelayError(new Error("boom"));
    expect(converted.code).toBe("INTERNAL");
    expect(converted.message).toBe("本地中继内部错误");
  });

  it("toErrorBody 仅在有 upstreamStatus 时附带该字段", () => {
    expect(
      toErrorBody(new RelayError("UPSTREAM_ERROR", "上游错误", 502)),
    ).toEqual({
      error: {
        code: "UPSTREAM_ERROR",
        message: "上游错误",
        upstreamStatus: 502,
      },
    });
    expect(toErrorBody(new RelayError("NOT_FOUND", "未找到"))).toEqual({
      error: { code: "NOT_FOUND", message: "未找到" },
    });
  });

  it("toUpstreamRelayError 保留 504/502，其余包裹为 UPSTREAM_ERROR", () => {
    const timeout = toUpstreamRelayError(
      new RelayError("UPSTREAM_TIMEOUT", "timeout", 504),
      "fallback",
    );
    expect(timeout.code).toBe("UPSTREAM_TIMEOUT");
    expect(timeout.message).toBe("timeout");
    expect(timeout.upstreamStatus).toBe(504);

    const converted = toUpstreamRelayError(
      new RelayError("AUTH_REQUIRED", "no"),
      "fallback",
    );
    expect(converted.code).toBe("UPSTREAM_ERROR");
    expect(converted.message).toBe("fallback");
  });
});

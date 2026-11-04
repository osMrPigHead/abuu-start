import { describe, expect, it } from "vitest";
import { faviconUrlFor, shortcutInitial } from "@/utils/favicon";

describe("favicon utils", () => {
  it("faviconUrlFor 只接受 http(s)", () => {
    expect(faviconUrlFor("https://example.com/path")).toBe(
      "https://example.com/favicon.ico",
    );
    expect(faviconUrlFor("http://example.com")).toBe(
      "http://example.com/favicon.ico",
    );
    expect(faviconUrlFor("ftp://example.com")).toBeNull();
    expect(faviconUrlFor("bad")).toBeNull();
  });

  it("shortcutInitial 返回首字符的大写形式", () => {
    expect(shortcutInitial("北航")).toBe("北");
    expect(shortcutInitial("abc")).toBe("A");
    expect(shortcutInitial("😀表情")).toBe("😀");
    expect(shortcutInitial("   ")).toBe("?");
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isRecord,
  optionalScalarText,
  optionalText,
  readInteger,
  textOrEmpty,
  toPositiveInteger,
} from "./guards.ts";
import { decodeEntities, htmlToText, stripHtml } from "./htmlText.ts";
import {
  normalizeDateTime,
  toShanghaiDateTime,
  toShanghaiEpochMs,
} from "./datetime.ts";

describe("guards", () => {
  it("isRecord 只接受普通对象", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });

  it("文本归一化区分必填与可选", () => {
    expect(textOrEmpty(3)).toBe("");
    expect(textOrEmpty(" x ")).toBe(" x ");
    expect(optionalText("  ")).toBeNull();
    expect(optionalText(" x ")).toBe("x");
    expect(optionalScalarText(90)).toBe("90");
    expect(optionalScalarText(Number.NaN)).toBeNull();
  });

  it("整数读取与正整数边界", () => {
    expect(readInteger("12")).toBe(12);
    expect(readInteger(-3)).toBe(-3);
    expect(readInteger("1.5")).toBeNull();
    expect(readInteger(" 12 ")).toBe(12);
    expect(toPositiveInteger("0")).toBeNull();
    expect(toPositiveInteger("3")).toBe(3);
    expect(toPositiveInteger(2.5)).toBeNull();
  });
});

describe("htmlText", () => {
  it("解码常见实体与数字实体", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &#39;d&#x27;")).toBe(
      "a & b <c> 'd'",
    );
  });

  it("剔除 script/style 并保留段落换行", () => {
    expect(htmlToText("<p>简介</p><script>x</script><p>A &amp; B</p>")).toBe(
      "简介\nA & B",
    );
    expect(htmlToText("<p>一</p><br><p>二</p>")).toBe("一\n\n二");
    expect(htmlToText("   ")).toBeNull();
    expect(htmlToText(null)).toBeNull();
  });

  it("stripHtml 单行化", () => {
    expect(stripHtml("<div>a <b>b</b></div>")).toBe("a b");
  });
});

describe("datetime", () => {
  it("normalizeDateTime 统一为秒级", () => {
    expect(normalizeDateTime("2026-03-02T08:00")).toBe("2026-03-02 08:00:00");
    expect(normalizeDateTime("2026-03-02 08:00:00")).toBe(
      "2026-03-02 08:00:00",
    );
    expect(normalizeDateTime("bad")).toBeNull();
  });

  it("带偏移时间转上海时区", () => {
    expect(toShanghaiDateTime("2026-02-19T16:00:00Z")).toBe(
      "2026-02-20 00:00:00",
    );
    expect(toShanghaiDateTime("2026-03-01 08:00:00")).toBe(
      "2026-03-01 08:00:00",
    );
  });

  it("toShanghaiEpochMs 按 +08:00 解析", () => {
    expect(toShanghaiEpochMs("2026-03-02 08:00:00")).toBe(
      Date.parse("2026-03-02T08:00:00+08:00"),
    );
    expect(toShanghaiEpochMs("bad")).toBeNull();
  });
});

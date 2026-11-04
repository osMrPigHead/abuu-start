import { describe, expect, it } from "vitest";

describe("components 目录结构", () => {
  it("components 根目录不直接存放 .vue 组件", () => {
    expect(Object.keys(import.meta.glob("../components/*.vue"))).toEqual([]);
  });
});

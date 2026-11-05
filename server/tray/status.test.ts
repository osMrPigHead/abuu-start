import { describe, expect, it } from "vitest";
import {
  TRAY_QUIT_ID,
  TRAY_SEPARATOR_ID,
  TRAY_STATUS_ID,
  presentTray,
} from "./status.ts";

describe("presentTray", () => {
  it("运行态给出绿色图标、地址与退出项", () => {
    const presentation = presentTray({ phase: "running", port: 3000 });

    expect(presentation.stateName).toBe("running");
    expect(presentation.tooltip).toContain("运行中");
    expect(presentation.tooltip).toContain("127.0.0.1:3000");
    expect(presentation.menu).toHaveLength(3);
    expect(presentation.menu[0]).toMatchObject({
      type: "item",
      id: TRAY_STATUS_ID,
      title: "运行中 · http://127.0.0.1:3000",
      enabled: false,
    });
    expect(presentation.menu[1]).toMatchObject({
      type: "separator",
      id: TRAY_SEPARATOR_ID,
    });
    expect(presentation.menu[2]).toMatchObject({
      type: "item",
      id: TRAY_QUIT_ID,
      title: "退出",
    });
  });

  it("异常态给出红色图标与失败原因", () => {
    const presentation = presentTray({
      phase: "error",
      port: 3000,
      reason: "端口 3000 已被占用",
    });

    expect(presentation.stateName).toBe("error");
    expect(presentation.tooltip).toContain("启动失败");
    expect(presentation.tooltip).toContain("端口 3000 已被占用");
    expect(presentation.menu[0]).toMatchObject({
      type: "item",
      id: TRAY_STATUS_ID,
      enabled: false,
    });
    expect(presentation.menu[0]?.title).toContain("端口 3000 已被占用");
    expect(presentation.menu[2]).toMatchObject({ id: TRAY_QUIT_ID });
  });

  it("失败原因压成单行并截断", () => {
    const presentation = presentTray({
      phase: "error",
      port: 3000,
      reason: `第一行\n第二行 ${"x".repeat(200)}`,
    });
    const title = presentation.menu[0]?.title ?? "";

    expect(title).not.toContain("\n");
    expect(title.length).toBeLessThan(256);
    expect(title.endsWith("…")).toBe(true);
  });

  it("空原因回退为未知错误", () => {
    const presentation = presentTray({
      phase: "error",
      port: 3000,
      reason: "   ",
    });

    expect(presentation.menu[0]?.title).toContain("未知错误");
  });
});

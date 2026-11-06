/**
 * 托盘状态到图标、tooltip 与菜单模板的纯映射。
 * tray-hook 的标题上限为 256 字符，失败原因在这里截断。
 */
import type { MenuItemTemplate } from "tray-hook";

export type TrayPhase = "running" | "error";

export type TrayState =
  | { phase: "running"; port: number }
  | { phase: "error"; port: number; reason: string };

export type TrayPresentation = {
  stateName: TrayPhase;
  tooltip: string;
  menu: MenuItemTemplate[];
};

export const TRAY_STATUS_ID = "status";
export const TRAY_SEPARATOR_ID = "status-separator";
export const TRAY_QUIT_ID = "quit";

const MAX_REASON_LENGTH = 120;

export function presentTray(state: TrayState): TrayPresentation {
  const address = `http://127.0.0.1:${state.port}`;

  if (state.phase === "running") {
    return {
      stateName: "running",
      tooltip: `航启中继 · 运行中 · 127.0.0.1:${state.port}`,
      menu: [
        {
          type: "item",
          id: TRAY_STATUS_ID,
          title: `运行中 · ${address}`,
          enabled: false,
        },
        { type: "separator", id: TRAY_SEPARATOR_ID },
        { type: "item", id: TRAY_QUIT_ID, title: "退出" },
      ],
    };
  }

  const reason = clampReason(state.reason);
  return {
    stateName: "error",
    tooltip: `航启中继 · 启动失败 · ${reason}`,
    menu: [
      {
        type: "item",
        id: TRAY_STATUS_ID,
        title: `启动失败 · ${reason}`,
        enabled: false,
      },
      { type: "separator", id: TRAY_SEPARATOR_ID },
      { type: "item", id: TRAY_QUIT_ID, title: "退出" },
    ],
  };
}

/** 菜单与 tooltip 都是单行文本；超长或空原因在这里归一化。 */
function clampReason(reason: string): string {
  const normalized = reason.replace(/\s+/g, " ").trim();
  const value = normalized === "" ? "未知错误" : normalized;
  if (value.length <= MAX_REASON_LENGTH) return value;

  return `${value.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

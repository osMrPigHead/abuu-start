import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_POMODORO_SETTINGS,
  POMODORO_PHASE_LABELS,
  formatPomodoroClock,
  formatPomodoroFinish,
  hasPomodoroSettings,
  isPomodoroNotificationSupported,
  nextPomodoroPhase,
  pomodoroNotificationPermission,
  pomodoroPhaseSeconds,
  requestPomodoroNotificationPermission,
  sanitizePomodoroSettings,
  showPomodoroNotification,
  validatePomodoroSettings,
} from "@/utils/pomodoro";

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(
    async () => "granted" as NotificationPermission,
  );
  static instances: FakeNotification[] = [];

  title: string;
  options: NotificationOptions | undefined;
  onclick: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(title: string, options?: NotificationOptions) {
    this.title = title;
    this.options = options;
    FakeNotification.instances.push(this);
  }

  close(): void {
    this.onclose?.();
  }
}

function stubNotification(
  permission: NotificationPermission = "granted",
): typeof FakeNotification {
  FakeNotification.permission = permission;
  FakeNotification.instances = [];
  vi.stubGlobal("Notification", FakeNotification);
  return FakeNotification;
}

describe("pomodoro settings", () => {
  it("validatePomodoroSettings 接受合法配置", () => {
    expect(validatePomodoroSettings(DEFAULT_POMODORO_SETTINGS)).toBeNull();
    expect(
      validatePomodoroSettings({
        focusMinutes: 1,
        shortBreakMinutes: 60,
        longBreakMinutes: 60,
        roundsPerLongBreak: 12,
      }),
    ).toBeNull();
  });

  it("validatePomodoroSettings 校验上下界与整数", () => {
    expect(
      validatePomodoroSettings({
        ...DEFAULT_POMODORO_SETTINGS,
        focusMinutes: 0,
      }),
    ).toBe("专注时长需为 1–180 的整数");
    expect(
      validatePomodoroSettings({
        ...DEFAULT_POMODORO_SETTINGS,
        focusMinutes: 181,
      }),
    ).toBe("专注时长需为 1–180 的整数");
    expect(
      validatePomodoroSettings({
        ...DEFAULT_POMODORO_SETTINGS,
        shortBreakMinutes: 1.5,
      }),
    ).toBe("短休时长需为 1–60 的整数");
    expect(
      validatePomodoroSettings({
        ...DEFAULT_POMODORO_SETTINGS,
        longBreakMinutes: 0,
      }),
    ).toBe("长休时长需为 1–60 的整数");
    expect(
      validatePomodoroSettings({
        ...DEFAULT_POMODORO_SETTINGS,
        roundsPerLongBreak: 13,
      }),
    ).toBe("每几轮进入长休需为 1–12 的整数");
  });

  it("sanitizePomodoroSettings 逐字段回退默认值", () => {
    expect(sanitizePomodoroSettings(null)).toEqual(DEFAULT_POMODORO_SETTINGS);
    expect(
      sanitizePomodoroSettings({
        focusMinutes: 50,
        shortBreakMinutes: "10",
        longBreakMinutes: 0,
      }),
    ).toEqual({
      focusMinutes: 50,
      shortBreakMinutes: DEFAULT_POMODORO_SETTINGS.shortBreakMinutes,
      longBreakMinutes: DEFAULT_POMODORO_SETTINGS.longBreakMinutes,
      roundsPerLongBreak: DEFAULT_POMODORO_SETTINGS.roundsPerLongBreak,
    });
  });

  it("hasPomodoroSettings 要求四个字段全部合法", () => {
    expect(hasPomodoroSettings(DEFAULT_POMODORO_SETTINGS)).toBe(true);
    expect(
      hasPomodoroSettings({ ...DEFAULT_POMODORO_SETTINGS, focusMinutes: 0 }),
    ).toBe(false);
    expect(hasPomodoroSettings({ focusMinutes: 25 })).toBe(false);
    expect(hasPomodoroSettings([])).toBe(false);
  });
});

describe("pomodoro phase rules", () => {
  it("pomodoroPhaseSeconds 返回各阶段秒数", () => {
    expect(pomodoroPhaseSeconds(DEFAULT_POMODORO_SETTINGS, "focus")).toBe(
      25 * 60,
    );
    expect(pomodoroPhaseSeconds(DEFAULT_POMODORO_SETTINGS, "short-break")).toBe(
      5 * 60,
    );
    expect(pomodoroPhaseSeconds(DEFAULT_POMODORO_SETTINGS, "long-break")).toBe(
      15 * 60,
    );
  });

  it("nextPomodoroPhase 按轮次进入短休或长休", () => {
    expect(nextPomodoroPhase("focus", 1, DEFAULT_POMODORO_SETTINGS)).toBe(
      "short-break",
    );
    expect(nextPomodoroPhase("focus", 4, DEFAULT_POMODORO_SETTINGS)).toBe(
      "long-break",
    );
    expect(nextPomodoroPhase("focus", 0, DEFAULT_POMODORO_SETTINGS)).toBe(
      "short-break",
    );
    expect(nextPomodoroPhase("short-break", 4, DEFAULT_POMODORO_SETTINGS)).toBe(
      "focus",
    );
    expect(nextPomodoroPhase("long-break", 4, DEFAULT_POMODORO_SETTINGS)).toBe(
      "focus",
    );
  });

  it("阶段标签完整", () => {
    expect(POMODORO_PHASE_LABELS).toEqual({
      focus: "专注",
      "short-break": "短休",
      "long-break": "长休",
    });
  });
});

describe("pomodoro formatting", () => {
  it("formatPomodoroClock 按 mm:ss 输出", () => {
    expect(formatPomodoroClock(0)).toBe("00:00");
    expect(formatPomodoroClock(59)).toBe("00:59");
    expect(formatPomodoroClock(60)).toBe("01:00");
    expect(formatPomodoroClock(3599)).toBe("59:59");
    expect(formatPomodoroClock(6000)).toBe("100:00");
    expect(formatPomodoroClock(-5)).toBe("00:00");
  });

  it("formatPomodoroFinish 补零到 HH:mm", () => {
    expect(formatPomodoroFinish(new Date(2026, 2, 2, 8, 5))).toBe("08:05");
    expect(formatPomodoroFinish(new Date(2026, 2, 2, 23, 59))).toBe("23:59");
  });
});

describe("pomodoro notifications", () => {
  it("未支持通知时返回安全默认值", () => {
    expect(isPomodoroNotificationSupported()).toBe(false);
    expect(pomodoroNotificationPermission()).toBeNull();
    expect(showPomodoroNotification("test", "phase-end")).toBe(false);
  });

  it("requestPomodoroNotificationPermission 返回浏览器结果", async () => {
    stubNotification("default");
    await expect(requestPomodoroNotificationPermission()).resolves.toBe(
      "granted",
    );
  });

  it("已授权时创建通知并返回 true", () => {
    const Fake = stubNotification("granted");
    expect(pomodoroNotificationPermission()).toBe("granted");
    expect(showPomodoroNotification("测试通知", "one-minute")).toBe(true);
    expect(Fake.instances).toHaveLength(1);
    expect(Fake.instances[0]?.title).toBe("航启番茄钟");
    expect(Fake.instances[0]?.options?.body).toBe("测试通知");
    expect(Fake.instances[0]?.options?.tag).toBe(
      "buaa-start-pomodoro-one-minute",
    );
  });

  it("已拒绝或构造通知抛错时返回 false", () => {
    stubNotification("denied");
    expect(showPomodoroNotification("测试", "phase-end")).toBe(false);

    stubNotification("granted");
    vi.stubGlobal(
      "Notification",
      class ThrowingNotification {
        static permission: NotificationPermission = "granted";
        constructor() {
          throw new Error("boom");
        }
      },
    );
    expect(showPomodoroNotification("测试", "phase-end")).toBe(false);
  });
});

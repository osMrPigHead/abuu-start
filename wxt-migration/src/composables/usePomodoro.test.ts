import { describe, expect, it, vi } from "vitest";
import type { PomodoroSettings } from "@/types";
import { STORAGE_KEYS } from "@/cache/storage";

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
  FakeNotification.requestPermission = vi.fn(async () => permission);
  vi.stubGlobal("Notification", FakeNotification);
  return FakeNotification;
}

async function loadPomodoro(
  options: {
    settings?: Partial<PomodoroSettings>;
    notifications?: boolean;
  } = {},
) {
  window.localStorage.clear();
  if (options.settings !== undefined) {
    window.localStorage.setItem(
      STORAGE_KEYS.pomodoroSettings,
      JSON.stringify(options.settings),
    );
  }
  if (options.notifications !== undefined) {
    window.localStorage.setItem(
      STORAGE_KEYS.pomodoroNotifications,
      JSON.stringify(options.notifications),
    );
  }
  vi.resetModules();
  return import("@/composables/usePomodoro");
}

const shortSettings: PomodoroSettings = {
  focusMinutes: 1,
  shortBreakMinutes: 1,
  longBreakMinutes: 1,
  roundsPerLongBreak: 2,
};

describe("usePomodoro initial state", () => {
  it("无完整配置时停留在配置页", async () => {
    const { usePomodoro } = await loadPomodoro();
    const pomodoro = usePomodoro();
    expect(pomodoro.started.value).toBe(false);
    expect(pomodoro.settings.value).toEqual({
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      roundsPerLongBreak: 4,
    });
    expect(pomodoro.running.value).toBe(false);
  });

  it("有完整配置时直接进入专注态", async () => {
    const { usePomodoro } = await loadPomodoro({ settings: shortSettings });
    const pomodoro = usePomodoro();
    expect(pomodoro.started.value).toBe(true);
    expect(pomodoro.phase.value).toBe("focus");
    expect(pomodoro.remainingSeconds.value).toBe(60);
  });

  it("start 校验配置并开始专注", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 2, 8, 0));
    const { usePomodoro } = await loadPomodoro();
    const pomodoro = usePomodoro();

    expect(pomodoro.start({ ...shortSettings, focusMinutes: 0 })).toBe(false);
    expect(pomodoro.started.value).toBe(false);

    expect(pomodoro.start(shortSettings)).toBe(true);
    expect(pomodoro.started.value).toBe(true);
    expect(pomodoro.phase.value).toBe("focus");
    expect(pomodoro.running.value).toBe(true);
    expect(pomodoro.remainingSeconds.value).toBe(60);
    expect(pomodoro.expectedFinishAt.value.getTime()).toBe(
      new Date(2026, 2, 2, 8, 1).getTime(),
    );
    expect(
      JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.pomodoroSettings) ?? "{}",
      ),
    ).toEqual(shortSettings);
  });
});

describe("usePomodoro controls", () => {
  it("pause 保留剩余时间，resume 重新计算结束时间", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 2, 8, 0));
    const { usePomodoro } = await loadPomodoro();
    const pomodoro = usePomodoro();
    pomodoro.start(shortSettings);

    vi.advanceTimersByTime(10_000);
    pomodoro.pause();
    expect(pomodoro.running.value).toBe(false);
    expect(pomodoro.paused.value).toBe(true);
    expect(pomodoro.remainingSeconds.value).toBe(50);

    pomodoro.resume();
    expect(pomodoro.running.value).toBe(true);
    expect(pomodoro.paused.value).toBe(false);
    expect(pomodoro.expectedFinishAt.value.getTime()).toBe(
      new Date(2026, 2, 2, 8, 0, 60).getTime(),
    );
  });

  it("reset 回到当前阶段完整时长并保留轮次", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 2, 8, 0));
    const { usePomodoro } = await loadPomodoro();
    const pomodoro = usePomodoro();
    pomodoro.start(shortSettings);
    vi.advanceTimersByTime(10_000);
    pomodoro.reset();

    expect(pomodoro.running.value).toBe(false);
    expect(pomodoro.paused.value).toBe(false);
    expect(pomodoro.remainingSeconds.value).toBe(60);
    expect(pomodoro.completedRounds.value).toBe(0);
  });

  it("editSettings 停止并回到配置页", async () => {
    vi.useFakeTimers();
    const { usePomodoro } = await loadPomodoro({ settings: shortSettings });
    const pomodoro = usePomodoro();
    pomodoro.editSettings();

    expect(pomodoro.started.value).toBe(false);
    expect(pomodoro.phase.value).toBe("focus");
    expect(pomodoro.running.value).toBe(false);
    expect(pomodoro.settings.value).toEqual(shortSettings);
  });
});

describe("usePomodoro phase transitions", () => {
  it("专注结束进入短休，休息结束回到专注", async () => {
    vi.useFakeTimers();
    const { usePomodoro } = await loadPomodoro();
    const pomodoro = usePomodoro();
    pomodoro.start(shortSettings);

    vi.advanceTimersByTime(60_000);
    expect(pomodoro.phase.value).toBe("short-break");
    expect(pomodoro.completedRounds.value).toBe(1);
    expect(pomodoro.running.value).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(pomodoro.phase.value).toBe("focus");
    expect(pomodoro.completedRounds.value).toBe(1);
  });

  it("完成指定轮次后进入长休", async () => {
    vi.useFakeTimers();
    const { usePomodoro } = await loadPomodoro();
    const pomodoro = usePomodoro();
    pomodoro.start(shortSettings);

    vi.advanceTimersByTime(180_000);
    expect(pomodoro.phase.value).toBe("long-break");
    expect(pomodoro.completedRounds.value).toBe(2);
  });

  it("休眠跨多个阶段时连续推进且不重复通知历史阶段", async () => {
    vi.useFakeTimers();
    const { usePomodoro } = await loadPomodoro();
    const pomodoro = usePomodoro();
    pomodoro.start(shortSettings);

    vi.advanceTimersByTime(300_000);
    expect(pomodoro.phase.value).toBe("short-break");
    expect(pomodoro.completedRounds.value).toBe(3);
    expect(pomodoro.running.value).toBe(true);
  });
});

describe("usePomodoro notifications", () => {
  it("结束前 1 分钟发送一次通知", async () => {
    vi.useFakeTimers();
    const Fake = stubNotification("granted");
    const { usePomodoro } = await loadPomodoro({ notifications: true });
    const pomodoro = usePomodoro();
    pomodoro.start({ ...shortSettings, focusMinutes: 2 });

    vi.advanceTimersByTime(60_000);
    expect(Fake.instances).toHaveLength(1);
    expect(Fake.instances[0]?.options?.body).toContain("专注还剩 1 分钟");

    vi.advanceTimersByTime(60_000);
    expect(Fake.instances).toHaveLength(2);
    expect(Fake.instances[1]?.options?.body).toContain("专注结束");
  });

  it("通知关闭时不发送", async () => {
    vi.useFakeTimers();
    const Fake = stubNotification("granted");
    const { usePomodoro } = await loadPomodoro({ notifications: false });
    const pomodoro = usePomodoro();
    pomodoro.start({ ...shortSettings, focusMinutes: 2 });

    vi.advanceTimersByTime(60_000);
    expect(Fake.instances).toHaveLength(0);
  });

  it("setNotificationsEnabled 处理不支持、拒绝和授权", async () => {
    const unsupported = await loadPomodoro();
    const first = unsupported.usePomodoro();
    await first.setNotificationsEnabled(true);
    expect(first.notificationsEnabled.value).toBe(false);
    expect(first.notificationMessage.value).toBe("当前浏览器不支持桌面通知");

    stubNotification("denied");
    const denied = await loadPomodoro();
    const second = denied.usePomodoro();
    await second.setNotificationsEnabled(true);
    expect(second.notificationsEnabled.value).toBe(false);
    expect(second.notificationMessage.value).toContain("通知权限已被拒绝");

    stubNotification("granted");
    const granted = await loadPomodoro();
    const third = granted.usePomodoro();
    await third.setNotificationsEnabled(true);
    expect(third.notificationsEnabled.value).toBe(true);
    expect(third.notificationMessage.value).toBe("已开启番茄钟桌面通知");
  });

  it("testNotification 在关闭时提示先开启", async () => {
    const { usePomodoro } = await loadPomodoro({ notifications: false });
    const pomodoro = usePomodoro();
    await pomodoro.testNotification();
    expect(pomodoro.notificationMessage.value).toBe("请先开启番茄钟桌面通知");
  });
});

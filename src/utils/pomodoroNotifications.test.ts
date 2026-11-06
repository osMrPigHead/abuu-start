import { describe, expect, it, vi } from "vitest";
import {
  isPomodoroNotificationSupported,
  pomodoroNotificationPermission,
  requestPomodoroNotificationPermission,
  showPomodoroNotification,
} from "@/utils/pomodoroNotifications";

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
      "abuu-start-pomodoro-one-minute",
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

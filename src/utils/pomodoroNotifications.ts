/**
 * 番茄钟桌面通知的浏览器适配，见 docs/trd.md 8.6。
 * 权限不足、浏览器不支持或构造通知失败时静默返回 false。
 */

export type PomodoroNotificationKind = "one-minute" | "phase-end";

const NOTIFICATION_TITLE = "航启番茄钟";
const NOTIFICATION_TAGS: Record<PomodoroNotificationKind, string> = {
  "one-minute": "buaa-start-pomodoro-one-minute",
  "phase-end": "buaa-start-pomodoro-phase-end",
};

/** 保留通知引用，避免对象被回收后点击回调失效。 */
const activeNotifications = new Set<Notification>();

export function isPomodoroNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function pomodoroNotificationPermission(): NotificationPermission | null {
  if (!isPomodoroNotificationSupported()) return null;

  try {
    return Notification.permission;
  } catch {
    return null;
  }
}

export async function requestPomodoroNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isPomodoroNotificationSupported()) return null;

  try {
    return await Notification.requestPermission();
  } catch {
    return null;
  }
}

/** 发送固定标题的通知；权限不足或浏览器不支持时静默失败。 */
export function showPomodoroNotification(
  body: string,
  kind: PomodoroNotificationKind,
): boolean {
  if (pomodoroNotificationPermission() !== "granted") return false;

  try {
    const options: NotificationOptions & { renotify?: boolean } = {
      body,
      tag: NOTIFICATION_TAGS[kind],
      // 同一 tag 替换旧通知时仍提醒用户，避免后续阶段静默替换。
      renotify: true,
    };
    const notification = new Notification(NOTIFICATION_TITLE, options);

    activeNotifications.add(notification);
    const release = (): void => {
      activeNotifications.delete(notification);
    };

    notification.onclose = release;
    notification.onclick = () => {
      release();
      notification.close();
      window.focus();
    };

    return true;
  } catch {
    return false;
  }
}

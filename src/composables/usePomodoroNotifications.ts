/** 番茄钟桌面通知权限、开关与测试，模块级单例。 */
import { readonly, ref } from "vue";
import {
  isPomodoroNotificationSupported,
  pomodoroNotificationPermission,
  requestPomodoroNotificationPermission,
  showPomodoroNotification,
} from "@/utils/pomodoro";
import { readJson, STORAGE_KEYS, writeJson } from "@/utils/storage";

const storedPreference = readJson<boolean>(STORAGE_KEYS.pomodoroNotifications);
const hasStoredPreference =
  storedPreference === true || storedPreference === false;
const initialPermission = pomodoroNotificationPermission();

// 未做过选择时默认开启；浏览器权限在首次开始专注时再请求。
const enabled = ref(
  hasStoredPreference
    ? storedPreference === true
    : isPomodoroNotificationSupported() && initialPermission !== "denied",
);
const message = ref("");
const busy = ref(false);
const permission = ref<NotificationPermission | null>(initialPermission);
let promptAttempted = false;

// 权限已被拒绝或浏览器不支持时，开关回到关闭；权限仍为 default 时保留开启，
// 等用户在“开始”手势中授权。
if (
  enabled.value &&
  (initialPermission === null || initialPermission === "denied")
) {
  enabled.value = false;
  writeJson(STORAGE_KEYS.pomodoroNotifications, false);
}

export function usePomodoroNotifications() {
  return {
    enabled: readonly(enabled),
    busy: readonly(busy),
    message: readonly(message),
    permission: readonly(permission),
    refreshPermission,
    ensurePermission,
    setEnabled,
    testNotification,
  };
}

function refreshPermission(): void {
  permission.value = pomodoroNotificationPermission();
}

/**
 * 首次开始专注时请求一次通知权限；用户已关闭、已拒绝或不支持时不反复弹窗。
 * 由“开始/继续”点击触发，满足浏览器的用户手势要求。
 */
function ensurePermission(): void {
  if (!enabled.value) return;

  refreshPermission();
  const currentPermission = permission.value;

  if (currentPermission === "granted") return;

  if (currentPermission === null) {
    enabled.value = false;
    writeJson(STORAGE_KEYS.pomodoroNotifications, false);
    message.value = "当前浏览器不支持桌面通知";
    return;
  }

  if (currentPermission === "denied") {
    enabled.value = false;
    writeJson(STORAGE_KEYS.pomodoroNotifications, false);
    message.value = "通知权限已被拒绝，请在浏览器设置中允许后重试";
    return;
  }

  if (promptAttempted || busy.value) return;

  promptAttempted = true;
  busy.value = true;
  void requestPomodoroNotificationPermission()
    .then((result) => {
      permission.value = result;
      if (result === "granted") {
        enabled.value = true;
        writeJson(STORAGE_KEYS.pomodoroNotifications, true);
        message.value = "已开启番茄钟桌面通知";
        return;
      }

      enabled.value = false;
      writeJson(STORAGE_KEYS.pomodoroNotifications, false);
      message.value =
        result === "denied"
          ? "通知权限已被拒绝，请在浏览器设置中允许后重试"
          : "未能获得通知权限，番茄钟仍会正常计时";
    })
    .finally(() => {
      busy.value = false;
    });
}

/**
 * 开启时请求通知权限；不支持或被拒绝时开关回到关闭并给出提示。
 * 关闭只写偏好，不影响正在运行的计时。
 */
async function setEnabled(nextEnabled: boolean): Promise<void> {
  if (busy.value) return;

  promptAttempted = true;
  refreshPermission();

  if (!nextEnabled) {
    enabled.value = false;
    const stored = writeJson(STORAGE_KEYS.pomodoroNotifications, false);
    message.value = stored
      ? "已关闭番茄钟桌面通知"
      : "已关闭，但本地存储不可用";
    return;
  }

  if (!isPomodoroNotificationSupported()) {
    permission.value = null;
    enabled.value = false;
    writeJson(STORAGE_KEYS.pomodoroNotifications, false);
    message.value = "当前浏览器不支持桌面通知";
    return;
  }

  busy.value = true;
  try {
    let currentPermission = permission.value;
    if (currentPermission === "default") {
      currentPermission = await requestPomodoroNotificationPermission();
      permission.value = currentPermission;
    }

    if (currentPermission !== "granted") {
      enabled.value = false;
      writeJson(STORAGE_KEYS.pomodoroNotifications, false);
      message.value =
        currentPermission === "denied"
          ? "通知权限已被拒绝，请在浏览器设置中允许后重试"
          : "未能获得通知权限，番茄钟仍会正常计时";
      return;
    }

    enabled.value = true;
    const stored = writeJson(STORAGE_KEYS.pomodoroNotifications, true);
    message.value = stored
      ? "已开启番茄钟桌面通知"
      : "已开启，但本地存储不可用，刷新后会恢复默认";
  } finally {
    busy.value = false;
  }
}

/** 发送一条测试通知，用于确认浏览器与系统通知是否真正放行。 */
async function testNotification(): Promise<void> {
  if (!enabled.value) {
    message.value = "请先开启番茄钟桌面通知";
    return;
  }

  if (pomodoroNotificationPermission() !== "granted") {
    await setEnabled(true);
    if (!enabled.value) return;
  }

  const shown = showPomodoroNotification(
    "这是一条测试通知。若桌面未显示，请检查浏览器与系统通知设置。",
    "phase-end",
  );
  message.value = shown
    ? "测试通知已发送；若桌面仍未显示，请检查系统通知设置"
    : "测试通知发送失败，请检查浏览器通知设置";
}

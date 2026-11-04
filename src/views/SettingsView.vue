<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import LoginSection from "@/components/auth/LoginSection.vue";
import PageHeader from "@/components/common/PageHeader.vue";
import BackgroundSection from "@/components/settings/BackgroundSection.vue";
import HighlightSection from "@/components/settings/HighlightSection.vue";
import HomeCardsSection from "@/components/settings/HomeCardsSection.vue";
import OperationsSection from "@/components/settings/OperationsSection.vue";
import RelaySection from "@/components/settings/RelaySection.vue";
import YgdkTargetsSection from "@/components/settings/YgdkTargetsSection.vue";
import SourceStateList from "@/components/auth/SourceStateList.vue";
import { useAuth } from "@/composables/useAuth";
import { useBackground } from "@/composables/useBackground";
import { useDataSourceActions } from "@/composables/useDataSourceActions";
import {
  HOME_CARD_OPTIONS,
  useHomeCards,
  type HomeCardId,
} from "@/composables/useHomeCards";
import { usePomodoro } from "@/composables/usePomodoro";
import { useRelay, type RelayStatus } from "@/composables/useRelay";
import { useScheduleSettings } from "@/composables/useScheduleSettings";
import { useYgdk } from "@/composables/useYgdk";
import { useYgdkSettings } from "@/composables/useYgdkSettings";
import { resolveYgdkTermTarget, resolveYgdkWeekLimit } from "@/utils/ygdk";
import { isStorageDegraded } from "@/utils/storage";
import type { AuthSourceId } from "@shared/auth";

const {
  state: authState,
  refreshStatus: refreshAuthStatus,
  preload: preloadAuth,
  login: requestLogin,
  retrySource: retryAuthSource,
  logout: logoutAuth,
  pollWhileDeriving,
} = useAuth();
const { state: relayState, checkRelay } = useRelay();
const { refreshAll, clearBusinessCaches } = useDataSourceActions();
const { state: ygdkState, refresh: refreshYgdk } = useYgdk();
const { highlightLeadMinutes, setHighlightLeadMinutes } = useScheduleSettings();
const { visibility: homeCardVisibility, setVisible: setHomeCardVisible } =
  useHomeCards();
const {
  state: backgroundState,
  builtinBackground,
  saveDirectory: saveBackgroundDirectory,
  clearDirectory: clearBackgroundDirectory,
  rescan: rescanBackground,
} = useBackground();
const {
  termTarget: ygdkUserTermTarget,
  weekTarget: ygdkUserWeekTarget,
  setTermTarget: setYgdkTermTarget,
  setWeekTarget: setYgdkWeekTarget,
} = useYgdkSettings();
const {
  notificationsEnabled: pomodoroNotificationsEnabled,
  notificationBusy: pomodoroNotificationBusy,
  notificationMessage: pomodoroNotificationMessage,
  notificationPermission: pomodoroNotificationPermission,
  refreshNotificationPermission: refreshPomodoroNotificationPermission,
  testNotification: testPomodoroNotification,
  setNotificationsEnabled: setPomodoroNotificationsEnabled,
} = usePomodoro();

const cacheMessage = ref("");
const degraded = ref(false);
const ygdkTargetMessage = ref("");
const leadMessage = ref("");
const homeCardMessage = ref("");

let stopDerivationPolling: (() => void) | null = null;

/** 学期目标优先系统值；周限制始终用设置值，与主页卡片口径一致。 */
const ygdkEffectiveTermTarget = computed(() =>
  resolveYgdkTermTarget(
    ygdkState.overview?.termTarget ?? 0,
    ygdkUserTermTarget.value,
  ),
);
const ygdkEffectiveWeekLimit = computed(() =>
  resolveYgdkWeekLimit(ygdkUserWeekTarget.value),
);
const relayText = computed(() => relayStatusText(relayState.status));
const relayMessage = computed(() => relayState.message);
const relayClass = computed(() =>
  relayState.status === "ok"
    ? "text-emerald-200/80"
    : relayState.status === "error"
      ? "text-amber-200/80"
      : "text-white/45",
);

onMounted(() => {
  degraded.value = isStorageDegraded();
  void checkRelay();
  // 学期目标可能由系统值覆盖，设置页需要当前概览才能显示“当前生效”。
  void refreshYgdk();
  void refreshAuthStatus(true).then(() => {
    if (!authState.deriving) return;
    stopDerivationPolling?.();
    stopDerivationPolling = pollWhileDeriving();
  });
  refreshPomodoroNotificationPermission();
});

onUnmounted(() => {
  stopDerivationPolling?.();
  stopDerivationPolling = null;
});

/** 登录成功后四类数据源自动刷新一次，并开始轮询派生状态。 */
async function handleLogin(values: {
  username: string;
  password: string;
  captcha: string;
}): Promise<void> {
  const ok = await requestLogin(values);
  if (!ok) return;

  stopDerivationPolling?.();
  stopDerivationPolling = pollWhileDeriving();

  refreshAll();
}

async function handleRefreshCaptcha(): Promise<void> {
  await preloadAuth();
}

/** 退出登录：清业务缓存，保留待办、快捷方式、番茄钟、背景与显示开关。 */
async function handleLogout(): Promise<void> {
  const ok = await logoutAuth();
  if (!ok) return;

  stopDerivationPolling?.();
  stopDerivationPolling = null;

  clearBusinessCaches();
  cacheMessage.value = "已退出登录，已清除业务缓存";
  degraded.value = isStorageDegraded();
}

async function handleRetrySource(source: AuthSourceId): Promise<void> {
  await retryAuthSource(source);
}

// 派生结束（含登录后的异步派生）后再刷新一次各数据源，回主页即可看到数据。
watch(
  () => authState.deriving,
  (deriving, previous) => {
    if (!previous || deriving) return;
    refreshAll();
  },
);

function handleYgdkSave(termTarget: number, weekTarget: number): void {
  const storedTerm = setYgdkTermTarget(termTarget);
  const storedWeek = setYgdkWeekTarget(weekTarget);
  ygdkTargetMessage.value =
    storedTerm && storedWeek
      ? "已保存，主页阳光卡片立即生效"
      : "已保存到本次会话，但本地存储不可用";
}

function handleLeadSave(value: number): void {
  const stored = setHighlightLeadMinutes(value);
  leadMessage.value = stored
    ? "已保存，高亮边界立即生效"
    : "已保存到本次会话，但本地存储不可用";
}

async function togglePomodoroNotifications(): Promise<void> {
  await setPomodoroNotificationsEnabled(!pomodoroNotificationsEnabled.value);
}

/** 主页卡片开关立即生效并持久化，无保存按钮，见 docs/ui-lowfi.md 设置。 */
function toggleHomeCard(id: HomeCardId): void {
  const stored = setHomeCardVisible(id, !homeCardVisibility[id]);
  homeCardMessage.value = stored
    ? "已保存，立即生效"
    : "已保存到本次会话，但本地存储不可用";
}

async function saveBackground(path: string): Promise<void> {
  await saveBackgroundDirectory(path);
}

async function rescanBackgroundFiles(): Promise<void> {
  await rescanBackground();
}

async function clearBackground(): Promise<void> {
  await clearBackgroundDirectory();
}

function clearCaches(): void {
  clearBusinessCaches();
  cacheMessage.value = "已清除全部缓存";
  degraded.value = isStorageDegraded();
}

function relayStatusText(status: RelayStatus): string {
  switch (status) {
    case "ok":
      return "已连接";
    case "error":
      return "无法连接";
    default:
      return "检查中";
  }
}
</script>

<template>
  <div class="home-backdrop min-h-screen text-white antialiased">
    <main class="mx-auto w-full max-w-3xl px-8 py-10">
      <PageHeader
        title="设置"
        subtitle="登录状态由本地中继加密保存在本机，前端不保存凭据。"
      />

      <div class="route-page-body flow-root">
        <p
          v-if="degraded"
          class="mt-4 rounded-2xl border border-amber-200/20 bg-amber-200/[0.07] px-4 py-3 text-xs text-amber-100/75"
        >
          本地存储不可用，缓存仅在本次页面内有效。
        </p>

        <LoginSection
          :authenticated="authState.authenticated"
          :user="authState.user"
          :authenticated-at="authState.authenticatedAt"
          :persisted="authState.persisted"
          :deriving="authState.deriving"
          :loading="authState.loading"
          :error="authState.error"
          :warning="authState.warning"
          :captcha-required="authState.captchaRequired"
          :captcha-image="authState.captchaImage"
          :already-logged-in="authState.alreadyLoggedIn"
          :last-error-code="authState.lastErrorCode"
          :sources="authState.sources"
          @submit="handleLogin"
          @refresh-captcha="handleRefreshCaptcha"
          @logout="handleLogout"
        >
          <SourceStateList
            v-if="authState.authenticated"
            :sources="authState.sources"
            @retry="handleRetrySource"
          />
        </LoginSection>

        <YgdkTargetsSection
          :term-target="ygdkUserTermTarget"
          :week-target="ygdkUserWeekTarget"
          :effective-term="ygdkEffectiveTermTarget"
          :effective-week="ygdkEffectiveWeekLimit"
          :message="ygdkTargetMessage"
          @save="handleYgdkSave"
        />

        <HighlightSection
          :lead-minutes="highlightLeadMinutes"
          :message="leadMessage"
          @save="handleLeadSave"
        />

        <HomeCardsSection
          :options="HOME_CARD_OPTIONS"
          :visibility="homeCardVisibility"
          :message="homeCardMessage"
          @toggle="toggleHomeCard"
        />

        <BackgroundSection
          :state="backgroundState"
          :builtin-background="builtinBackground"
          @save="saveBackground"
          @rescan="rescanBackgroundFiles"
          @clear="clearBackground"
        />

        <OperationsSection
          :notifications-enabled="pomodoroNotificationsEnabled"
          :notification-busy="pomodoroNotificationBusy"
          :notification-message="pomodoroNotificationMessage"
          :notification-permission="pomodoroNotificationPermission"
          :cache-message="cacheMessage"
          @toggle-notifications="togglePomodoroNotifications"
          @test-notification="testPomodoroNotification"
          @clear-cache="clearCaches"
        />

        <RelaySection
          :text="relayText"
          :message="relayMessage"
          :text-class="relayClass"
          @check="checkRelay"
        />
      </div>
    </main>
  </div>
</template>

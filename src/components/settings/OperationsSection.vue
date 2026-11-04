<script setup lang="ts">
import { computed } from "vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";

const props = defineProps<{
  notificationsEnabled: boolean;
  notificationBusy: boolean;
  notificationMessage: string;
  notificationPermission: "default" | "denied" | "granted" | null;
  cacheMessage: string;
}>();

const emit = defineEmits<{
  toggleNotifications: [];
  testNotification: [];
  clearCache: [];
}>();

const permissionText = computed(() => {
  switch (props.notificationPermission) {
    case "granted":
      return "已授权";
    case "denied":
      return "已拒绝";
    case "default":
      return "待授权";
    default:
      return "当前浏览器不支持";
  }
});

const dangerButtonClass =
  "rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-4 py-2 text-sm text-amber-100/75 backdrop-blur-xl transition hover:border-amber-200/35 hover:bg-amber-200/[0.1] hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-35";
</script>

<template>
  <SettingsSection title="操作">
    <div
      class="mt-4 flex items-center justify-between gap-4 border-b border-white/10 pb-4"
    >
      <div class="min-w-0">
        <p class="text-sm text-white/80">番茄钟桌面通知</p>
        <p class="mt-1 text-xs leading-relaxed text-white/45">
          阶段结束前 1 分钟与结束时发送；首次开启或首次开始专注时请求通知权限。
        </p>
        <p class="mt-1 text-[11px] text-white/35">
          通知权限：{{ permissionText }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/60 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-35"
          :disabled="!notificationsEnabled || notificationBusy"
          @click="emit('testNotification')"
        >
          测试通知
        </button>
        <ToggleSwitch
          :checked="notificationsEnabled"
          :disabled="notificationBusy"
          :label="
            notificationsEnabled ? '关闭番茄钟桌面通知' : '开启番茄钟桌面通知'
          "
          @toggle="emit('toggleNotifications')"
        />
      </div>
    </div>

    <p
      v-if="notificationMessage"
      class="mt-2 text-xs text-white/55"
      aria-live="polite"
    >
      {{ notificationMessage }}
    </p>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        :class="dangerButtonClass"
        @click="emit('clearCache')"
      >
        清除缓存
      </button>
    </div>
    <p
      v-if="cacheMessage"
      class="mt-2 text-xs text-white/45"
      aria-live="polite"
    >
      {{ cacheMessage }}
    </p>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { pad2 } from "@/utils/date";

const props = defineProps<{
  now: Date;
  showActions: boolean;
  isEditing: boolean;
}>();

const emit = defineEmits<{
  search: [query: string];
  create: [];
  edit: [];
  minimal: [];
}>();

const keyword = ref("");
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const dateText = computed(() => {
  const value = props.now;
  const weekday = weekdays[value.getDay()] ?? "Sun";
  return `${value.getFullYear()}${pad2(value.getMonth() + 1)}${pad2(value.getDate())}\u2002${weekday}`;
});

const timeText = computed(() => {
  const value = props.now;
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
});

const dateTime = computed(() => props.now.toISOString());

function submitSearch(): void {
  const query = keyword.value.trim();
  if (query.length === 0) return;
  emit("search", query);
}

const topButtonClass =
  "flex h-[2.43rem] w-[2.43rem] shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-950/40 text-white/60 backdrop-blur-xl transition hover:border-white/35 hover:bg-slate-950/55 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40";
</script>

<template>
  <header
    class="route-page-header flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"
  >
    <div class="home-clock" aria-label="当前日期与时间">
      <time :datetime="dateTime" class="home-clock-date">{{ dateText }}</time>
      <time :datetime="dateTime" class="home-clock-time">{{ timeText }}</time>
    </div>

    <div class="flex w-full items-center justify-end gap-3 lg:w-auto">
      <form
        class="flex h-[2.43rem] w-full max-w-[26rem] items-center gap-1.5 rounded-full border border-white/20 bg-slate-950/40 pl-4 pr-1.5 backdrop-blur-xl transition focus-within:border-white/35 focus-within:bg-slate-950/55 lg:w-[22rem] lg:max-w-none lg:flex-none xl:w-[24rem]"
        role="search"
        @submit.prevent="submitSearch"
      >
        <input
          v-model="keyword"
          type="text"
          inputmode="search"
          enterkeyhint="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="使用 Bing 搜索"
          aria-label="搜索关键词"
          class="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/45"
        />
        <button
          type="submit"
          aria-label="使用 Bing 搜索"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            class="h-[18px] w-[18px]"
          >
            <path
              d="m14.5 14.5 3 3m-2-8.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </form>

      <button
        v-if="showActions"
        type="button"
        :class="topButtonClass"
        aria-label="新建快捷方式"
        title="新建快捷方式"
        @click="emit('create')"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>

      <button
        v-if="showActions"
        type="button"
        :class="[
          topButtonClass,
          isEditing ? 'ring-2 ring-white/50 text-white' : '',
        ]"
        :aria-pressed="isEditing"
        :aria-label="isEditing ? '退出编辑' : '编辑快捷方式'"
        :title="isEditing ? '退出编辑' : '编辑快捷方式'"
        @click="emit('edit')"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5">
          <path
            d="m4 20 4.4-1 9.6-9.6a2.1 2.1 0 0 0-3-3L5.4 16 4 20Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <button
        type="button"
        :class="topButtonClass"
        aria-label="进入仅时钟与背景模式"
        title="仅时钟与背景模式"
        @click="emit('minimal')"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5">
          <path
            d="M2.75 12S6.2 5.75 12 5.75 21.25 12 21.25 12 17.8 18.25 12 18.25 2.75 12 2.75 12Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle
            cx="12"
            cy="12"
            r="2.75"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
      </button>

      <RouterLink
        v-if="showActions"
        to="/settings"
        :class="topButtonClass"
        aria-label="设置"
        title="设置"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.08A1.65 1.65 0 0 0 10.1 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15.2 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.14.6.64 1.04 1.25 1.09H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </RouterLink>
    </div>
  </header>
</template>

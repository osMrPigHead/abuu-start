<script setup lang="ts">
import { computed } from "vue";
import { pad2 } from "@/utils/date";

const props = defineProps<{
  now: Date;
}>();

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
</script>

<template>
  <div class="minimal-clock route-page-minimal" aria-label="当前时间与日期">
    <time :datetime="dateTime" class="minimal-clock-time">{{ timeText }}</time>
    <time :datetime="dateTime" class="minimal-clock-date">{{ dateText }}</time>
  </div>
</template>

/** 主页明日课表预取：功能区隐藏、卡片关闭或明日仍在当前周时不请求。 */
import { watch, type Ref } from "vue";
import { useSchedule } from "@/composables/useSchedule";
import type { HomeCardVisibility } from "@/domain/homeLayout";

type UseHomePreloadOptions = {
  homeAreaVisible: Ref<boolean>;
  cardVisibility: HomeCardVisibility;
  tomorrowWeekNumber: Ref<number | null>;
  todayWeekNumber: Ref<number | null>;
  maxWeek: Ref<number>;
};

export function useHomePreload(options: UseHomePreloadOptions) {
  const { entries, loadWeek } = useSchedule();

  function preloadTomorrow(): void {
    if (!options.homeAreaVisible.value) return;
    if (!options.cardVisibility.schedule) return;

    const week = options.tomorrowWeekNumber.value;
    if (week === null || week > options.maxWeek.value) return;
    if (week === options.todayWeekNumber.value) return;

    const existing = entries[week];
    if (!existing || (!existing.loaded && !existing.loading)) {
      void loadWeek(week);
    }
  }

  watch(options.tomorrowWeekNumber, preloadTomorrow, { immediate: true });

  return { preloadTomorrow };
}

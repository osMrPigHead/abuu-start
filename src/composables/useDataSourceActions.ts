/** 跨数据源的统一 hydrate/refresh/clear 编排，避免页面各自维护数据源列表。 */
import { useBykcChosen } from "@/composables/useBykcChosen";
import { useBykcDetail } from "@/composables/useBykcDetail";
import { useBykc } from "@/composables/useBykcList";
import { useExams } from "@/composables/useExams";
import { useSchedule } from "@/composables/useSchedule";
import { useSpoc } from "@/composables/useSpoc";
import { useYgdk } from "@/composables/useYgdk";
import type { HomeCardVisibility } from "@/utils/homeLayout";
import { clearCache } from "@/utils/storage";

export function useDataSourceActions() {
  const schedule = useSchedule();
  const exams = useExams();
  const spoc = useSpoc();
  const ygdk = useYgdk();
  const bykc = useBykc();
  const bykcChosen = useBykcChosen();
  const bykcDetail = useBykcDetail();

  /** 只读缓存，不发请求。 */
  function hydrateAll(): void {
    schedule.hydrate();
    exams.hydrate();
    spoc.hydrate();
    ygdk.hydrate();
    bykcChosen.hydrate();
  }

  /** 刷新全部业务数据源；博雅广场只刷新当前页。 */
  function refreshAll(): void {
    void schedule.refreshCurrent();
    void exams.refresh();
    void spoc.refresh();
    void bykc.refresh();
    void bykcChosen.refresh();
    void ygdk.refresh();
  }

  /** 按主页卡片开关刷新，关闭的卡片不请求。 */
  function refreshVisible(visibility: HomeCardVisibility): void {
    if (visibility.schedule) {
      void schedule.refreshCurrent();
      void exams.refresh();
      void bykcChosen.refresh();
    }
    if (visibility.bykc) void bykc.loadPage(1);
    if (visibility.todo) void spoc.refresh();
    if (visibility.ygdk) void ygdk.refresh();
  }

  /** 退出登录/清缓存：清业务缓存并重置内存状态，保留待办、快捷方式与偏好。 */
  function clearBusinessCaches(): void {
    schedule.clearScheduleData();
    exams.clearExamsData();
    spoc.clearSpocData();
    bykc.clearBykcData();
    bykcChosen.clearBykcChosenData();
    bykcDetail.close();
    ygdk.clearYgdkData();
    clearCache();
  }

  return {
    hydrateAll,
    refreshAll,
    refreshVisible,
    clearBusinessCaches,
  };
}

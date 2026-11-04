<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import BykcCourseModal from "@/components/bykc/BykcCourseModal.vue";
import BykcSquareCard from "@/components/home/BykcSquareCard.vue";
import FocusCard from "@/components/home/FocusCard.vue";
import HomeBoard from "@/components/home/HomeBoard.vue";
import HomeTopBar from "@/components/home/HomeTopBar.vue";
import MinimalClockLayer from "@/components/home/MinimalClockLayer.vue";
import ScheduleOverviewCard from "@/components/home/ScheduleOverviewCard.vue";
import ShortcutCard from "@/components/home/ShortcutCard.vue";
import ShortcutDialog from "@/components/home/ShortcutDialog.vue";
import SpocDetailDialog from "@/components/spoc/SpocDetailDialog.vue";
import TodoCard from "@/components/home/TodoCard.vue";
import YgdkCard from "@/components/home/YgdkCard.vue";
import { useBykcDetail } from "@/composables/useBykcDetail";
import { useBykcList } from "@/composables/useBykcList";
import { useClock } from "@/composables/useClock";
import { useDataSourceActions } from "@/composables/useDataSourceActions";
import {
  HOME_BOARD_ROW_COUNT,
  HOME_BOARD_ROW_GAP_REM,
  HOME_BOARD_ROW_STEP_REM,
  useHomeBoard,
} from "@/composables/useHomeBoard";
import { useHomeCards } from "@/composables/useHomeCards";
import { useHomeDisplay } from "@/composables/useHomeDisplay";
import { useHomePreload } from "@/composables/useHomePreload";
import { useHomeSummary } from "@/composables/useHomeSummary";
import { useHorizontalWheelScroll } from "@/composables/useHorizontalWheelScroll";
import { usePomodoro } from "@/composables/usePomodoro";
import { useShortcutDrag } from "@/composables/useShortcutDrag";
import { useShortcutEditor } from "@/composables/useShortcutEditor";
import { useSpoc, useSpocDetail } from "@/composables/useSpoc";
import { useTodos } from "@/composables/useTodos";
import { useYgdk } from "@/composables/useYgdk";
import { useYgdkSettings } from "@/composables/useYgdkSettings";
import { filterOpenSpocAssignments } from "@/domain/spoc";
import { resolveYgdkTermTarget, resolveYgdkWeekLimit } from "@/domain/ygdk";

const { now } = useClock();
const { now: spocNow } = useClock(30_000);
const router = useRouter();

const { visibility: cardVisibility } = useHomeCards();
const {
  display: homeDisplay,
  enterMinimalMode,
  exitMinimalMode,
} = useHomeDisplay();
const { refreshVisible } = useDataSourceActions();

/** 仅时钟与背景模式只在本页（`/`）生效，离开主页不影响子页面。 */
const minimalMode = computed(() => homeDisplay.minimalMode);
/** 功能区隐藏或进入仅时钟模式时，既不渲染功能区也不发起取数，见 docs/prd-phase3.md 4.5。 */
const homeAreaVisible = computed(
  () => !minimalMode.value && homeDisplay.showFunctionArea,
);

const {
  meta,
  maxWeek,
  todayDate,
  tomorrowDate,
  todayWeekNumber,
  tomorrowWeekNumber,
  todayView,
  tomorrowView,
  todayCourses,
  tomorrowCourses,
  todayState,
  tomorrowState,
  scheduleBadge,
  scheduleCanRetry,
  scheduleNeedsSettings,
  retryScheduleSources,
  nextLine,
  nextPromptState,
  recentExams,
  examEmptyText,
  examState,
  refreshExams,
  highlightLeadMinutes,
} = useHomeSummary(now);

const { preloadTomorrow } = useHomePreload({
  homeAreaVisible,
  cardVisibility,
  tomorrowWeekNumber,
  todayWeekNumber,
  maxWeek,
});

const { state: ygdkState, refresh: refreshYgdk } = useYgdk();
const { termTarget: ygdkUserTermTarget, weekTarget: ygdkUserWeekTarget } =
  useYgdkSettings();
const { state: bykcState, refresh: refreshBykc } = useBykcList();
const {
  state: bykcDetailState,
  open: openBykcDetail,
  refresh: refreshBykcDetail,
  close: closeBykcDetail,
} = useBykcDetail();
const { state: spocState, refresh: refreshSpoc } = useSpoc();
const {
  state: spocDetailState,
  open: openSpocDetail,
  refresh: refreshSpocDetail,
  close: closeSpocDetail,
} = useSpocDetail();
const { todos, addTodo, updateTodo, removeTodo, toggleTodo } = useTodos();
const {
  shortcuts,
  moveShortcutTo,
  isEditing,
  shortcutDialogOpen,
  editingShortcut,
  openCreateDialog,
  openEditDialog,
  closeShortcutDialog,
  submitShortcut,
  removeShortcutFromDialog,
  toggleEditing: toggleShortcutEditing,
} = useShortcutEditor();

/** 学期目标优先系统值；周限制始终用用户设置，见 docs/trd-phase2.md 7.4。 */
const ygdkTermTarget = computed(() =>
  resolveYgdkTermTarget(
    ygdkState.overview?.termTarget ?? 0,
    ygdkUserTermTarget.value,
  ),
);
const ygdkWeekLimit = computed(() =>
  resolveYgdkWeekLimit(ygdkUserWeekTarget.value),
);

const openSpocAssignments = computed(() =>
  filterOpenSpocAssignments(spocState.assignments, spocNow.value),
);

const {
  settings: pomodoroSettings,
  phase: pomodoroPhase,
  phaseSeconds: pomodoroPhaseSeconds,
  remainingSeconds: pomodoroRemainingSeconds,
  running: pomodoroRunning,
  started: pomodoroStarted,
  paused: pomodoroPaused,
  completedRounds: pomodoroCompletedRounds,
  expectedFinishAt: pomodoroExpectedFinishAt,
  start: startPomodoro,
  saveSettings: savePomodoroSettings,
  pause: pausePomodoro,
  resume: resumePomodoro,
  reset: resetPomodoro,
  editSettings: editPomodoroSettings,
} = usePomodoro();

const {
  homeLayout,
  cardPlacements,
  boardStyle,
  placementStyle,
  rowGuideStyle,
  shortcutPlacements,
  boardWidthRem,
} = useHomeBoard({
  visibility: cardVisibility,
  shortcuts,
  isEditing,
});

const boardElement = ref<HTMLElement | null>(null);
const { setScrollElement: setBoardScrollElement, onWheel: handleBoardWheel } =
  useHorizontalWheelScroll();

const rowStarts = computed(() => homeLayout.value.rowStarts);
const {
  draggingId,
  dragRow,
  insertionStyle,
  handleShortcutDragStart,
  handleBoardDragOver,
  handleBoardDrop,
  handleShortcutDragEnd,
  resetDragState,
} = useShortcutDrag({
  boardElement,
  isEditing,
  boardWidthRem,
  shortcutPlacements,
  rowStarts,
  rowCount: HOME_BOARD_ROW_COUNT,
  rowStepRem: HOME_BOARD_ROW_STEP_REM,
  rowGapRem: HOME_BOARD_ROW_GAP_REM,
  rowTopRem: (row) => row * HOME_BOARD_ROW_STEP_REM,
  moveShortcutTo,
});

/** 卡片关闭时不请求；功能区隐藏或仅时钟模式下整体不请求。 */
function refreshHomeData(): void {
  refreshVisible(cardVisibility);
  preloadTomorrow();
}

onMounted(() => {
  if (homeAreaVisible.value) refreshHomeData();
});

/** 恢复显示时按卡片开关刷新；进入仅时钟模式或隐藏功能区时先退出编辑并关闭弹层。 */
watch(homeAreaVisible, (visible) => {
  if (!visible) {
    closeHomeEditing();
    shortcutDialogOpen.value = false;
    closeBykcDetail();
    closeSpocDetail();
    return;
  }

  refreshHomeData();
});

watch(
  () => homeDisplay.showActionButtons,
  (visible) => {
    if (!visible) closeHomeEditing();
  },
);

function closeHomeEditing(): void {
  isEditing.value = false;
  resetDragState();
}

function openSchedule(): void {
  void router.push("/schedule");
}

function openExams(): void {
  void router.push("/exams");
}

function submitSearch(query: string): void {
  window.location.assign(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  );
}

function toggleEditing(): void {
  toggleShortcutEditing();
  resetDragState();
}

onBeforeUnmount(closeSpocDetail);
</script>

<template>
  <div
    class="home-backdrop min-h-screen text-white antialiased"
    :class="{ 'home-backdrop-minimal': minimalMode }"
  >
    <Transition name="minimal-clock">
      <MinimalClockLayer v-if="minimalMode" :now="now" />
    </Transition>

    <button
      v-if="minimalMode"
      type="button"
      class="fixed inset-0 z-0 cursor-default bg-transparent focus-visible:outline focus-visible:-outline-offset-4 focus-visible:outline-2 focus-visible:outline-white/25"
      aria-label="切换到完全功能模式"
      @click="exitMinimalMode"
    ></button>

    <main class="flex min-h-screen w-full flex-col py-8">
      <div class="mx-auto w-full max-w-[1440px] px-6 sm:px-10">
        <Transition name="home-top">
          <HomeTopBar
            v-if="!minimalMode"
            :now="now"
            :show-actions="homeDisplay.showActionButtons"
            :is-editing="isEditing"
            @search="submitSearch"
            @create="openCreateDialog"
            @edit="toggleEditing"
            @minimal="enterMinimalMode"
          />
        </Transition>
      </div>

      <Transition name="home-board">
        <div
          v-if="homeAreaVisible"
          :ref="setBoardScrollElement"
          class="waterfall-scroll home-board-fullbleed route-page-body mt-6 overflow-x-auto overflow-y-hidden pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/30"
          role="region"
          aria-label="功能区，可左右滚动"
          tabindex="0"
          @wheel="handleBoardWheel"
        >
          <div
            ref="boardElement"
            class="waterfall-board"
            :style="boardStyle"
            @dragover="handleBoardDragOver"
            @drop="handleBoardDrop"
          >
            <HomeBoard
              :row-count="HOME_BOARD_ROW_COUNT"
              :is-editing="isEditing"
              :drag-row="dragRow"
              :row-guide-style="rowGuideStyle"
              :insertion-style="insertionStyle"
              :show-insertion="
                Boolean(
                  isEditing &&
                  draggingId &&
                  dragRow !== null &&
                  insertionStyle.left,
                )
              "
            >
              <div
                v-if="cardPlacements.schedule"
                class="absolute"
                :style="placementStyle(cardPlacements.schedule)"
              >
                <ScheduleOverviewCard
                  :badge="scheduleBadge"
                  :can-retry="scheduleCanRetry"
                  :needs-settings="scheduleNeedsSettings"
                  :next-line="nextLine"
                  :next-prompt-state="nextPromptState"
                  :today-date="todayDate"
                  :today-week-number="todayWeekNumber"
                  :today-courses="todayCourses"
                  :today-section-times="todayView.sectionTimes"
                  :today-state="todayState"
                  :tomorrow-date="tomorrowDate"
                  :tomorrow-week-number="tomorrowWeekNumber"
                  :tomorrow-courses="tomorrowCourses"
                  :tomorrow-section-times="tomorrowView.sectionTimes"
                  :tomorrow-state="tomorrowState"
                  :now="now"
                  :highlight-lead-minutes="highlightLeadMinutes"
                  :recent-exams="recentExams"
                  :exam-status="examState.status"
                  :exam-error="examState.error"
                  :exam-empty-text="examEmptyText"
                  :warning="meta.warning"
                  @open-schedule="openSchedule"
                  @open-exams="openExams"
                  @retry="retryScheduleSources"
                  @refresh-exams="refreshExams"
                />
              </div>

              <div
                v-if="cardPlacements.bykc"
                class="absolute"
                :style="placementStyle(cardPlacements.bykc)"
              >
                <BykcSquareCard
                  class="h-full w-full"
                  :courses="bykcState.courses"
                  :status="bykcState.status"
                  :saved-at="bykcState.savedAt"
                  :error="bykcState.error"
                  :loading="bykcState.loading"
                  @open="openBykcDetail"
                  @retry="refreshBykc"
                />
              </div>

              <div
                v-if="cardPlacements.todo"
                class="absolute"
                :style="placementStyle(cardPlacements.todo)"
              >
                <TodoCard
                  :todos="todos"
                  :spoc-assignments="openSpocAssignments"
                  :spoc-status="spocState.status"
                  :spoc-saved-at="spocState.savedAt"
                  :spoc-error="spocState.error"
                  :spoc-loading="spocState.loading"
                  class="h-full w-full"
                  @create="addTodo"
                  @update="updateTodo"
                  @remove="removeTodo"
                  @toggle="toggleTodo"
                  @refresh-spoc="refreshSpoc"
                  @open-spoc="openSpocDetail"
                />
              </div>

              <div
                v-if="cardPlacements.focus"
                class="absolute"
                :style="placementStyle(cardPlacements.focus)"
              >
                <FocusCard
                  :settings="pomodoroSettings"
                  :phase="pomodoroPhase"
                  :phase-seconds="pomodoroPhaseSeconds"
                  :remaining-seconds="pomodoroRemainingSeconds"
                  :running="pomodoroRunning"
                  :started="pomodoroStarted"
                  :paused="pomodoroPaused"
                  :completed-rounds="pomodoroCompletedRounds"
                  :expected-finish-at="pomodoroExpectedFinishAt"
                  @start="startPomodoro"
                  @settings-change="savePomodoroSettings"
                  @pause="pausePomodoro"
                  @resume="resumePomodoro"
                  @reset="resetPomodoro"
                  @edit="editPomodoroSettings"
                />
              </div>

              <div
                v-if="cardPlacements.ygdk"
                class="absolute"
                :style="placementStyle(cardPlacements.ygdk)"
              >
                <YgdkCard
                  class="h-full w-full"
                  :status="ygdkState.status"
                  :overview="ygdkState.overview"
                  :term-target="ygdkTermTarget"
                  :week-limit="ygdkWeekLimit"
                  :saved-at="ygdkState.savedAt"
                  :error="ygdkState.error"
                  :loading="ygdkState.loading"
                  @retry="refreshYgdk"
                />
              </div>

              <ShortcutCard
                v-for="placement in shortcutPlacements"
                :key="placement.id"
                :shortcut="placement.shortcut"
                :editing="isEditing"
                :dragging="draggingId === placement.id"
                :style="placementStyle(placement)"
                @edit="openEditDialog(placement.shortcut)"
                @dragstart="handleShortcutDragStart(placement.shortcut)"
                @dragend="handleShortcutDragEnd"
              />
            </HomeBoard>
          </div>
        </div>
      </Transition>
    </main>

    <ShortcutDialog
      :open="shortcutDialogOpen"
      :shortcut="editingShortcut"
      @close="closeShortcutDialog"
      @submit="submitShortcut"
      @remove="removeShortcutFromDialog"
    />

    <BykcCourseModal
      :open="bykcDetailState.courseId !== null"
      :preview="bykcDetailState.preview"
      :detail="bykcDetailState.course"
      :status="bykcDetailState.status"
      :saved-at="bykcDetailState.savedAt"
      :error="bykcDetailState.error"
      :loading="bykcDetailState.loading"
      :not-found="bykcDetailState.notFound"
      @close="closeBykcDetail"
      @retry="refreshBykcDetail"
    />

    <SpocDetailDialog
      :open="spocDetailState.assignmentId !== null"
      :preview="spocDetailState.preview"
      :detail="spocDetailState.assignment"
      :status="spocDetailState.status"
      :saved-at="spocDetailState.savedAt"
      :error="spocDetailState.error"
      :loading="spocDetailState.loading"
      :not-found="spocDetailState.notFound"
      @close="closeSpocDetail"
      @retry="refreshSpocDetail"
    />
  </div>
</template>

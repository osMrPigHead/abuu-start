<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import HomeCard from '@/components/HomeCard.vue'
import type { PomodoroSettings } from '@/types'
import {
  formatPomodoroClock,
  formatPomodoroFinish,
  POMODORO_PHASE_LABELS,
  validatePomodoroSettings,
  type PomodoroPhase,
} from '@/utils/pomodoro'

const props = defineProps<{
  settings: PomodoroSettings
  phase: PomodoroPhase
  phaseSeconds: number
  remainingSeconds: number
  running: boolean
  started: boolean
  paused: boolean
  completedRounds: number
  expectedFinishAt: Date
}>()

const emit = defineEmits<{
  start: [settings: PomodoroSettings]
  settingsChange: [settings: PomodoroSettings]
  pause: []
  resume: []
  reset: []
  edit: []
}>()

const draft = reactive<Record<keyof PomodoroSettings, string | number>>({
  focusMinutes: String(props.settings.focusMinutes),
  shortBreakMinutes: String(props.settings.shortBreakMinutes),
  longBreakMinutes: String(props.settings.longBreakMinutes),
  roundsPerLongBreak: String(props.settings.roundsPerLongBreak),
})

const errorMessage = ref('')

const phaseLabel = computed(() => POMODORO_PHASE_LABELS[props.phase])
const clockText = computed(() => formatPomodoroClock(props.remainingSeconds))
const finishText = computed(() => formatPomodoroFinish(props.expectedFinishAt))
const primaryLabel = computed(() => {
  if (props.running) return '暂停'
  return props.paused ? '继续' : '开始'
})

const actionClass =
  'flex h-9 items-center justify-center rounded-full border border-white/20 bg-slate-950/40 text-[13px] text-white/80 backdrop-blur-xl transition hover:border-white/35 hover:bg-slate-950/55 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40'

const inputClass =
  'h-8 w-[4.5rem] rounded-full border border-white/20 bg-slate-950/40 px-3 text-right text-[13px] text-white outline-none backdrop-blur-xl transition placeholder:text-white/45 focus:border-white/35 focus:bg-slate-950/55'

function submitSettings(): void {
  const settings = readDraft()
  const error = validatePomodoroSettings(settings)
  if (error) {
    errorMessage.value = error
    return
  }

  errorMessage.value = ''
  emit('start', settings)
}

/** 设置态自动保存：所有字段都合法时才同步到父级，非法输入只在提交时提示。 */
function persistSettings(): void {
  const settings = readDraft()
  if (validatePomodoroSettings(settings) === null) {
    emit('settingsChange', settings)
  }
}

function readDraft(): PomodoroSettings {
  return {
    focusMinutes: parseInteger(draft.focusMinutes),
    shortBreakMinutes: parseInteger(draft.shortBreakMinutes),
    longBreakMinutes: parseInteger(draft.longBreakMinutes),
    roundsPerLongBreak: parseInteger(draft.roundsPerLongBreak),
  }
}

function handlePrimary(): void {
  if (props.running) {
    emit('pause')
    return
  }

  emit('resume')
}

function parseInteger(value: string | number): number {
  const text = String(value).trim()
  if (!/^\d+$/.test(text)) return Number.NaN
  return Number(text)
}
</script>

<template>
  <HomeCard title="专注" class="h-full w-full">
    <template #actions>
      <button
        v-if="started"
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/55 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        aria-label="编辑专注配置"
        title="编辑专注配置"
        @click="emit('edit')"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-4 w-4">
          <path
            d="m4 20 4.4-1 9.6-9.6a2.1 2.1 0 0 0-3-3L5.4 16 4 20Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </template>

    <form
      v-if="!started"
      class="flex min-h-0 flex-1 flex-col justify-between gap-2"
      novalidate
      @input="persistSettings"
      @submit.prevent="submitSettings"
    >
      <div class="flex flex-col gap-1.5">
        <label class="flex items-center justify-center gap-3">
          <span class="w-[5.5rem] shrink-0 text-right text-[11px] text-white/55">专注时长</span>
          <span class="flex items-center gap-1.5">
            <input
              v-model="draft.focusMinutes"
              type="number"
              min="1"
              max="180"
              step="1"
              inputmode="numeric"
              autocomplete="off"
              aria-label="专注时长（分钟）"
              :class="inputClass"
            >
            <span class="w-6 text-[10px] text-white/35">分钟</span>
          </span>
        </label>

        <label class="flex items-center justify-center gap-3">
          <span class="w-[5.5rem] shrink-0 text-right text-[11px] text-white/55">短休时长</span>
          <span class="flex items-center gap-1.5">
            <input
              v-model="draft.shortBreakMinutes"
              type="number"
              min="1"
              max="60"
              step="1"
              inputmode="numeric"
              autocomplete="off"
              aria-label="短休时长（分钟）"
              :class="inputClass"
            >
            <span class="w-6 text-[10px] text-white/35">分钟</span>
          </span>
        </label>

        <label class="flex items-center justify-center gap-3">
          <span class="w-[5.5rem] shrink-0 text-right text-[11px] text-white/55">长休时长</span>
          <span class="flex items-center gap-1.5">
            <input
              v-model="draft.longBreakMinutes"
              type="number"
              min="1"
              max="60"
              step="1"
              inputmode="numeric"
              autocomplete="off"
              aria-label="长休时长（分钟）"
              :class="inputClass"
            >
            <span class="w-6 text-[10px] text-white/35">分钟</span>
          </span>
        </label>

        <label class="flex items-center justify-center gap-3">
          <span class="w-[5.5rem] shrink-0 text-right text-[11px] text-white/55">每几轮进入长休</span>
          <span class="flex items-center gap-1.5">
            <input
              v-model="draft.roundsPerLongBreak"
              type="number"
              min="1"
              max="12"
              step="1"
              inputmode="numeric"
              autocomplete="off"
              aria-label="每几轮进入长休"
              :class="inputClass"
            >
            <span class="w-6 text-[10px] text-white/35">轮</span>
          </span>
        </label>
      </div>

      <p class="min-h-3 text-[10px] leading-tight text-red-300" aria-live="polite">
        {{ errorMessage }}
      </p>

      <button type="submit" :class="[actionClass, 'w-full']">开始</button>
    </form>

    <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-between gap-2">
      <time
        class="focus-time block w-full text-center text-white"
        :datetime="`PT${remainingSeconds}S`"
        :aria-label="`${phaseLabel} ${clockText}`"
        aria-live="off"
      >
        {{ clockText }}
      </time>

      <p
        v-if="!paused && running"
        class="text-center text-[10.5px] leading-tight text-white/45"
      >
        预计完成 {{ finishText }}
      </p>

      <p class="text-center text-[10.5px] leading-tight text-white/45">
        已完成 {{ completedRounds }} 轮
      </p>

      <div class="flex w-full gap-2">
        <button type="button" :class="[actionClass, 'flex-1']" @click="handlePrimary">
          {{ primaryLabel }}
        </button>
        <button type="button" :class="[actionClass, 'w-[7.5rem]']" @click="emit('reset')">
          重置
        </button>
      </div>
    </div>
  </HomeCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Shortcut } from '@/types'
import { faviconUrlFor, shortcutInitial } from '@/utils/favicon'

const props = withDefaults(
  defineProps<{
    shortcut: Shortcut
    editing?: boolean
    dragging?: boolean
  }>(),
  {
    editing: false,
    dragging: false,
  },
)

const emit = defineEmits<{
  edit: []
  dragstart: [event: DragEvent]
  dragend: []
}>()

const iconFailed = ref(false)
const iconUrl = computed(() => faviconUrlFor(props.shortcut.url))
const initial = computed(() => shortcutInitial(props.shortcut.title))

watch(
  () => props.shortcut.url,
  () => {
    iconFailed.value = false
  },
)

function handleDragStart(event: DragEvent): void {
  if (!props.editing) {
    event.preventDefault()
    return
  }

  event.dataTransfer?.setData('text/plain', props.shortcut.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  emit('dragstart', event)
}

function openEditor(): void {
  emit('edit')
}
</script>

<template>
  <component
    :is="editing ? 'div' : 'a'"
    :href="editing ? undefined : shortcut.url"
    :title="shortcut.title"
    :draggable="editing"
    :data-shortcut-id="shortcut.id"
    :data-shortcut-row="shortcut.row"
    class="group absolute flex items-center gap-2.5 rounded-2xl border border-white/15 bg-slate-950/50 px-3 backdrop-blur-md transition-all duration-200"
    :class="[
      editing
        ? 'cursor-grab hover:border-white/30 active:cursor-grabbing'
        : 'hover:border-white/25 hover:bg-slate-950/60',
      dragging ? 'opacity-40' : '',
    ]"
    @dragstart="handleDragStart"
    @dragend="emit('dragend')"
  >
    <span
      class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/10 text-xs font-medium text-white/60"
    >
      <img
        v-if="iconUrl && !iconFailed"
        :src="iconUrl"
        alt=""
        draggable="false"
        class="h-4 w-4 object-contain"
        @error="iconFailed = true"
      >
      <template v-else>{{ initial }}</template>
    </span>

    <span class="min-w-0 flex-1 truncate text-[13px] leading-tight text-white/90">
      {{ shortcut.title }}
    </span>

    <button
      v-if="editing"
      type="button"
      draggable="false"
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      :aria-label="`编辑${shortcut.title}`"
      title="编辑快捷方式"
      @mousedown.stop
      @click.stop="openEditor"
      @dragstart.stop.prevent
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-3.5 w-3.5">
        <path
          d="m4 20 4.4-1 9.6-9.6a2.1 2.1 0 0 0-3-3L5.4 16 4 20Z"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </component>
</template>

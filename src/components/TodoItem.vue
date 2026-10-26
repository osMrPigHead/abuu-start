<script setup lang="ts">
import { computed } from 'vue'
import type { Todo } from '@/types'
import { formatTodoDue, todoPriorityLabel } from '@/utils/todo'

const props = defineProps<{
  todo: Todo
}>()

const emit = defineEmits<{
  toggle: []
  edit: []
  remove: []
}>()

const dueText = computed(() => formatTodoDue(props.todo.dueAt))
const priorityText = computed(() => todoPriorityLabel(props.todo.priority))
const priorityClass = computed(() => {
  if (props.todo.done) return 'border-white/10 bg-white/[0.03] text-white/30'

  switch (props.todo.priority) {
    case 'high':
      return 'border-amber-300/30 bg-amber-300/10 text-amber-100/80'
    case 'low':
      return 'border-white/10 bg-white/[0.03] text-white/45'
    default:
      return 'border-white/15 bg-white/[0.06] text-white/60'
  }
})

function toggle(): void {
  emit('toggle')
}

function edit(): void {
  emit('edit')
}

function remove(): void {
  emit('remove')
}
</script>

<template>
  <li
    class="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 transition hover:border-white/18 hover:bg-white/[0.045]"
    :class="todo.done ? 'opacity-65' : ''"
  >
    <button
      type="button"
      role="checkbox"
      :aria-checked="todo.done"
      :aria-label="todo.done ? `取消完成：${todo.title}` : `完成：${todo.title}`"
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      :class="
        todo.done
          ? 'border-sky-300/55 bg-sky-300/20 text-sky-100'
          : 'border-white/25 text-transparent hover:border-white/45'
      "
      @click="toggle"
    >
      <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" class="h-3 w-3">
        <path
          d="m2.5 6.2 2.2 2.2 4.8-5"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div class="min-w-0 flex-1">
      <p
        class="min-w-0 truncate text-[14px] leading-snug"
        :class="todo.done ? 'text-white/40 line-through' : 'text-white/90'"
        :title="todo.title"
      >
        {{ todo.title }}
      </p>

      <p
        v-if="dueText"
        class="mt-0.5 text-[10px] leading-tight"
        :class="todo.done ? 'text-white/30' : 'text-white/45'"
      >
        截止 {{ dueText }}
      </p>
    </div>

    <span
      class="shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] leading-tight"
      :class="priorityClass"
    >
      {{ priorityText }}
    </span>

    <div class="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        :aria-label="`编辑：${todo.title}`"
        title="编辑"
        @click="edit"
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" class="h-3.5 w-3.5">
          <path
            d="M10.7 2.3a1.5 1.5 0 0 1 2.1 2.1L5.6 11.6l-2.9.7.7-2.9 7.3-7.1Z"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-full text-white/35 transition hover:bg-red-400/10 hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        :aria-label="`删除：${todo.title}`"
        title="删除"
        @click="remove"
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" class="h-3.5 w-3.5">
          <path
            d="M2.8 4.4h10.4M6.4 4.4V2.8h3.2v1.6M4.3 4.4l.6 8.1a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.6-8.1M6.6 7v3.9M9.4 7v3.9"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </li>
</template>

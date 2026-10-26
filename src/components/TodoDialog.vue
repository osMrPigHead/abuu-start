<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Todo } from '@/types'
import {
  TODO_PRIORITIES,
  TODO_REPEATS,
  todoPriorityLabel,
  todoRepeatLabel,
  validateTodoDraft,
  type TodoDraft,
} from '@/utils/todo'

const props = defineProps<{
  open: boolean
  todo: Todo | null
}>()

const emit = defineEmits<{
  close: []
  submit: [draft: TodoDraft]
}>()

const title = ref('')
const dueAt = ref('')
const note = ref('')
const priority = ref<Todo['priority']>('medium')
const repeat = ref<Todo['repeat']>('none')
const errorMessage = ref('')
const titleInput = ref<HTMLInputElement | null>(null)
const dueInput = ref<HTMLInputElement | null>(null)

watch(
  () => [props.open, props.todo?.id ?? ''] as const,
  async ([open]) => {
    if (!open) return

    title.value = props.todo?.title ?? ''
    dueAt.value = props.todo?.dueAt ?? ''
    note.value = props.todo?.note ?? ''
    priority.value = props.todo?.priority ?? 'medium'
    repeat.value = props.todo?.repeat ?? 'none'
    errorMessage.value = ''

    await nextTick()
    titleInput.value?.focus()
    titleInput.value?.select()
  },
  { immediate: true },
)

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKeydown)
    } else {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeydown)
    }
  },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

function close(): void {
  if (!props.open) return
  emit('close')
}

function submit(): void {
  const draft: TodoDraft = {
    title: title.value,
    dueAt: dueAt.value.trim().length > 0 ? dueAt.value.trim() : null,
    note: note.value,
    priority: priority.value,
    repeat: repeat.value,
  }

  const error = validateTodoDraft(draft)
  if (error) {
    errorMessage.value = error
    if (error === '请输入标题') {
      titleInput.value?.focus()
    } else if (error.includes('截止')) {
      dueInput.value?.focus()
    }
    return
  }

  errorMessage.value = ''
  emit('submit', draft)
}

const fieldClass =
  'mt-2 w-full rounded-2xl border border-white/20 bg-slate-950/60 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/40'
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm"
        @click.self="close"
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="todo-dialog-title"
          class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-slate-900/95 p-6 text-white shadow-[0_30px_100px_-30px_rgba(0,0,0,1)]"
        >
          <header>
            <h2 id="todo-dialog-title" class="text-lg font-medium tracking-wide">
              {{ todo ? '编辑待办' : '新建待办' }}
            </h2>
            <p class="mt-1 text-xs text-white/40">
              截止时间留空表示无截止时间；重复任务必须填写截止时间。
            </p>
          </header>

          <form class="mt-5" @submit.prevent="submit">
            <label class="block">
              <span class="text-xs tracking-wide text-white/55">标题</span>
              <input
                ref="titleInput"
                v-model="title"
                type="text"
                maxlength="120"
                autocomplete="off"
                spellcheck="false"
                placeholder="例如：提交作业"
                :class="[fieldClass, 'h-11 px-4']"
              >
            </label>

            <label class="mt-4 block">
              <span class="text-xs tracking-wide text-white/55">截止时间</span>
              <input
                ref="dueInput"
                v-model="dueAt"
                type="datetime-local"
                step="60"
                :class="[fieldClass, 'h-11 px-4 text-[13px]']"
              >
            </label>

            <label class="mt-4 block">
              <span class="text-xs tracking-wide text-white/55">备注</span>
              <textarea
                v-model="note"
                rows="3"
                maxlength="500"
                spellcheck="false"
                placeholder="可选"
                :class="[fieldClass, 'resize-y px-4 py-3 text-[13px] leading-relaxed']"
              ></textarea>
            </label>

            <div class="mt-4 grid grid-cols-2 gap-3">
              <label class="block">
                <span class="text-xs tracking-wide text-white/55">优先级</span>
                <select v-model="priority" :class="[fieldClass, 'h-11 px-4 text-[13px]']">
                  <option v-for="value in TODO_PRIORITIES" :key="value" :value="value">
                    {{ todoPriorityLabel(value) }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-xs tracking-wide text-white/55">重复</span>
                <select v-model="repeat" :class="[fieldClass, 'h-11 px-4 text-[13px]']">
                  <option v-for="value in TODO_REPEATS" :key="value" :value="value">
                    {{ todoRepeatLabel(value) }}
                  </option>
                </select>
              </label>
            </div>

            <p v-if="errorMessage" role="alert" class="mt-3 text-xs text-red-300">
              {{ errorMessage }}
            </p>

            <footer class="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                class="h-9 rounded-full border border-white/15 px-4 text-xs text-white/65 transition hover:border-white/30 hover:text-white"
                @click="close"
              >
                取消
              </button>
              <button
                type="submit"
                class="h-9 rounded-full border border-white/20 bg-white/10 px-4 text-xs font-medium text-white transition hover:border-white/35 hover:bg-white/15"
              >
                保存
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

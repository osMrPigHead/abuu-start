<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import HomeCard from '@/components/HomeCard.vue'
import SourceStatusLine from '@/components/SourceStatusLine.vue'
import SpocTodoItem from '@/components/SpocTodoItem.vue'
import TodoDialog from '@/components/TodoDialog.vue'
import TodoItem from '@/components/TodoItem.vue'
import type { SourceStatus, SpocAssignment, Todo } from '@/types'
import type { TodoDraft } from '@/utils/todo'

const props = withDefaults(
  defineProps<{
    todos: Todo[]
    spocAssignments: SpocAssignment[]
    spocStatus: SourceStatus
    spocSavedAt?: string | null
    spocError?: string | null
    spocLoading?: boolean
  }>(),
  {
    spocSavedAt: null,
    spocError: null,
    spocLoading: false,
  },
)

const emit = defineEmits<{
  create: [draft: TodoDraft]
  update: [id: string, draft: TodoDraft]
  remove: [id: string]
  toggle: [id: string]
  refreshSpoc: []
  openSpoc: [assignment: SpocAssignment]
}>()

const dialogOpen = ref(false)
const editingTodo = ref<Todo | null>(null)

const showSpocEmpty = computed(
  () =>
    props.spocAssignments.length === 0 &&
    props.spocError === null &&
    (props.spocStatus === 'ok' || props.spocStatus === 'cached'),
)

function openCreate(): void {
  editingTodo.value = null
  dialogOpen.value = true
}

function openEdit(todo: Todo): void {
  editingTodo.value = todo
  dialogOpen.value = true
}

function closeDialog(): void {
  dialogOpen.value = false
}

function submitTodo(draft: TodoDraft): void {
  const current = editingTodo.value
  dialogOpen.value = false

  if (current) {
    emit('update', current.id, draft)
    return
  }

  emit('create', draft)
}
</script>

<template>
  <HomeCard title="待办" dense class="h-full w-full">
    <div class="flex min-h-0 flex-1 flex-col gap-2">
      <section class="flex min-h-0 flex-1 flex-col">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-[10px] tracking-[0.18em] text-white/35">自定义待办</h3>
          <button
            type="button"
            class="flex h-6 shrink-0 items-center gap-1 rounded-full border border-white/20 bg-slate-950/40 px-2.5 text-[10px] text-white/70 backdrop-blur-xl transition hover:border-white/35 hover:bg-slate-950/55 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
            @click="openCreate"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" class="h-3 w-3">
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
            </svg>
            新增
          </button>
        </div>

        <ul v-if="todos.length > 0" class="todo-list mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
          <TodoItem
            v-for="todo in todos"
            :key="todo.id"
            :todo="todo"
            @toggle="emit('toggle', todo.id)"
            @edit="openEdit(todo)"
            @remove="emit('remove', todo.id)"
          />
        </ul>
        <p
          v-else
          class="mt-2 rounded-xl border border-dashed border-white/12 px-3 py-3 text-center text-[10.5px] text-white/35"
        >
          暂无待办
        </p>
      </section>

      <section
        class="flex min-h-0 flex-col border-t border-white/10 pt-1.5"
        :class="spocAssignments.length > 0 ? 'flex-1' : 'shrink-0'"
      >
        <RouterLink
          to="/spoc"
          class="flex items-center justify-between gap-3 rounded-lg py-0.5 transition hover:bg-white/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        >
          <span class="flex items-center gap-1 text-[10px] tracking-[0.18em] text-white/35">
            SPOC 作业
            <span aria-hidden="true">›</span>
          </span>
        </RouterLink>

        <ul
          v-if="spocAssignments.length > 0"
          class="todo-list mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5"
        >
          <SpocTodoItem
            v-for="assignment in spocAssignments"
            :key="assignment.assignmentId"
            :assignment="assignment"
            @open="emit('openSpoc', assignment)"
          />
        </ul>
        <p
          v-else-if="showSpocEmpty"
          class="mt-1.5 rounded-xl border border-dashed border-white/12 px-3 py-2 text-center text-[10.5px] text-white/35"
        >
          暂无未完成作业
        </p>

        <SourceStatusLine
          class="mt-1.5 shrink-0"
          :status="spocStatus"
          :saved-at="spocSavedAt"
          :error="spocError"
          :refreshing="spocLoading"
          compact
          no-credential-text="未配置 SPOC 凭据"
          auth-expired-text="SPOC 登录状态已失效"
          fallback-error-text="SPOC 作业加载失败"
          @retry="emit('refreshSpoc')"
        />
      </section>
    </div>
  </HomeCard>

  <TodoDialog
    :open="dialogOpen"
    :todo="editingTodo"
    @close="closeDialog"
    @submit="submitTodo"
  />
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Shortcut } from '@/types'
import { normalizeShortcutUrl, type ShortcutDraft } from '@/utils/shortcut'

const props = defineProps<{
  open: boolean
  shortcut: Shortcut | null
}>()

const emit = defineEmits<{
  close: []
  submit: [draft: ShortcutDraft]
  remove: [id: string]
}>()

const title = ref('')
const url = ref('')
const errorMessage = ref('')
const confirmingDelete = ref(false)
const titleInput = ref<HTMLInputElement | null>(null)
const urlInput = ref<HTMLInputElement | null>(null)

watch(
  () => [props.open, props.shortcut?.id ?? ''] as const,
  async ([open]) => {
    if (!open) return

    title.value = props.shortcut?.title ?? ''
    url.value = props.shortcut?.url ?? ''
    errorMessage.value = ''
    confirmingDelete.value = false

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
  const trimmedTitle = title.value.trim()
  if (trimmedTitle.length === 0) {
    errorMessage.value = '请输入标题'
    titleInput.value?.focus()
    return
  }

  const normalizedUrl = normalizeShortcutUrl(url.value)
  if (!normalizedUrl) {
    errorMessage.value = '请输入有效的 http(s) 链接'
    urlInput.value?.focus()
    return
  }

  errorMessage.value = ''
  emit('submit', { title: trimmedTitle, url: normalizedUrl })
}

function requestDelete(): void {
  if (!props.shortcut) return
  confirmingDelete.value = true
}

function confirmDelete(): void {
  if (!props.shortcut) return
  emit('remove', props.shortcut.id)
}
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
          aria-labelledby="shortcut-dialog-title"
          class="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900/95 p-6 text-white shadow-[0_30px_100px_-30px_rgba(0,0,0,1)]"
        >
          <header>
            <h2 id="shortcut-dialog-title" class="text-lg font-medium tracking-wide">
              {{ shortcut ? '编辑快捷方式' : '新建快捷方式' }}
            </h2>
            <p class="mt-1 text-xs text-white/40">填写标题与地址，仅支持 http(s) 链接。</p>
          </header>

          <form class="mt-5" @submit.prevent="submit">
            <label class="block">
              <span class="text-xs tracking-wide text-white/55">标题</span>
              <input
                ref="titleInput"
                v-model="title"
                type="text"
                maxlength="60"
                autocomplete="off"
                spellcheck="false"
                placeholder="例如：本研教育管理系统"
                class="mt-2 h-11 w-full rounded-full border border-white/20 bg-slate-950/60 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/40"
              >
            </label>

            <label class="mt-4 block">
              <span class="text-xs tracking-wide text-white/55">URL</span>
              <input
                ref="urlInput"
                v-model="url"
                type="text"
                inputmode="url"
                maxlength="2048"
                autocomplete="off"
                spellcheck="false"
                placeholder="https://example.com/"
                class="mt-2 h-11 w-full rounded-full border border-white/20 bg-slate-950/60 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/40"
              >
            </label>

            <p v-if="errorMessage" role="alert" class="mt-3 text-xs text-red-300">
              {{ errorMessage }}
            </p>

            <div
              v-if="shortcut && confirmingDelete"
              class="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-red-300/20 bg-red-400/5 px-4 py-3"
            >
              <span class="text-xs text-red-100/75">删除后无法恢复。</span>
              <div class="flex shrink-0 items-center gap-3 text-xs">
                <button
                  type="button"
                  class="text-white/55 transition hover:text-white"
                  @click="confirmingDelete = false"
                >
                  取消
                </button>
                <button
                  type="button"
                  class="font-medium text-red-200 transition hover:text-red-100"
                  @click="confirmDelete"
                >
                  确认删除
                </button>
              </div>
            </div>

            <footer class="mt-6 flex items-center justify-between gap-3">
              <button
                v-if="shortcut && !confirmingDelete"
                type="button"
                class="rounded-full px-1 text-xs text-red-300/80 transition hover:text-red-200"
                @click="requestDelete"
              >
                删除
              </button>
              <span v-else aria-hidden="true"></span>

              <div class="flex items-center gap-2">
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
              </div>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

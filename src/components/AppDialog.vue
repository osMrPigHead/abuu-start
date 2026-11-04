<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    titleId: string;
    panelClass?: string;
    bodyClass?: string;
    closeOnBackdrop?: boolean;
    closeLabel?: string;
    focusCloseButton?: boolean;
  }>(),
  {
    panelClass:
      "flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-950/85 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.95)] backdrop-blur-xl",
    bodyClass: "mt-5 pb-6",
    closeOnBackdrop: true,
    closeLabel: "关闭",
    focusCloseButton: true,
  },
);

const emit = defineEmits<{
  close: [];
}>();

const closeButton = ref<HTMLButtonElement | null>(null);
let isOpen = false;
let previousFocus: HTMLElement | null = null;
let bodyOverflow = "";

watch(
  () => props.open,
  (open) => {
    if (open) openModal();
    else closeModal();
  },
  { immediate: true },
);

onBeforeUnmount(closeModal);

function openModal(): void {
  if (isOpen) return;
  isOpen = true;

  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", handleKeydown);
  if (props.focusCloseButton) {
    void nextTick(() => closeButton.value?.focus());
  }
}

function closeModal(): void {
  if (!isOpen) return;
  isOpen = false;

  document.body.style.overflow = bodyOverflow;
  window.removeEventListener("keydown", handleKeydown);

  const target = previousFocus;
  previousFocus = null;
  target?.focus();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;

  event.preventDefault();
  emit("close");
}

function handleBackdrop(): void {
  if (props.closeOnBackdrop) emit("close");
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
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
        @click.self="handleBackdrop"
      >
        <section
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :class="panelClass"
        >
          <header class="flex items-start justify-between gap-4 px-6 pt-6">
            <div class="min-w-0 flex-1">
              <slot name="header" />
            </div>

            <button
              ref="closeButton"
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 transition hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
              :aria-label="closeLabel"
              @click="emit('close')"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                class="h-4 w-4"
              >
                <path
                  d="m6 6 12 12M18 6 6 18"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-6" :class="bodyClass">
            <slot></slot>
          </div>

          <footer
            v-if="$slots.footer"
            class="flex flex-wrap items-center gap-3 px-6 pb-6 pt-4"
          >
            <slot name="footer"></slot>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    checked: boolean;
    label: string;
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="checked"
    :aria-label="label"
    class="relative h-6 w-11 shrink-0 rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-50"
    :class="
      checked ? 'border-sky-300/40 bg-sky-300/25' : 'border-white/20 bg-white/10'
    "
    :disabled="disabled"
    @click="emit('toggle')"
  >
    <span
      class="absolute top-1 h-4 w-4 rounded-full bg-white transition-all"
      :class="checked ? 'left-6' : 'left-0.5'"
    ></span>
  </button>
</template>

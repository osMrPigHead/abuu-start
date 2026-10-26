<script setup lang="ts">
import { computed } from 'vue'
import type { SpocAssignment } from '@/types'
import { formatSpocDateTime, spocCourseLine, spocSubmissionLabel } from '@/utils/spoc'

const props = defineProps<{
  assignment: SpocAssignment
}>()

const emit = defineEmits<{
  open: []
}>()

const courseLine = computed(() => spocCourseLine(props.assignment))
const statusLabel = computed(() => spocSubmissionLabel(props.assignment))
const dueText = computed(() => {
  const text = formatSpocDateTime(props.assignment.dueTime)
  return text.length > 0 ? `截止 ${text}` : '无截止时间'
})
</script>

<template>
  <li>
    <button
      type="button"
      class="block w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 py-1 text-left transition hover:border-white/18 hover:bg-white/[0.045] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      @click="emit('open')"
    >
      <p class="min-w-0 truncate text-[10px] leading-tight text-white/45" :title="courseLine">
        {{ courseLine }}
      </p>

      <div class="mt-0.5 flex items-start justify-between gap-2">
        <p
          class="min-w-0 flex-1 truncate text-[13px] leading-snug text-white/85"
          :title="assignment.title"
        >
          {{ assignment.title }}
        </p>
        <span
          class="shrink-0 rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[9.5px] leading-tight text-white/50"
        >
          {{ statusLabel }}
        </span>
      </div>

      <p class="mt-0.5 text-[10px] font-medium leading-tight text-white/65">
        {{ dueText }}
      </p>
    </button>
  </li>
</template>
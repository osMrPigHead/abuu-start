<script setup lang="ts">
import PageStateNotice from "@/components/common/PageStateNotice.vue";
import SourceStatusLine from "@/components/common/SourceStatusLine.vue";
import type { SourcePageLabels } from "@/domain/sourceStatus";
import type { SourceStatus } from "@/types";

defineProps<{
  status: SourceStatus;
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  dataEmpty: boolean;
  labels: SourcePageLabels;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div
    class="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 backdrop-blur-md"
  >
    <SourceStatusLine
      :status="status"
      :saved-at="savedAt"
      :error="error"
      :refreshing="loading"
      :no-credential-text="labels.statusNoCredential"
      :auth-expired-text="labels.statusAuthExpired"
      :fallback-error-text="labels.statusFallback"
      @retry="emit('retry')"
    />
  </div>

  <PageStateNotice
    v-if="status === 'loading' && dataEmpty"
    kind="loading"
    :message="labels.noticeLoading"
  />

  <PageStateNotice
    v-else-if="status === 'no-credential' && dataEmpty"
    kind="no-credential"
    :message="labels.noticeNoCredential"
    settings-link
  />

  <PageStateNotice
    v-else-if="
      labels.noticeAuthExpired && status === 'auth-expired' && dataEmpty
    "
    kind="auth-expired"
    :message="labels.noticeAuthExpired ?? ''"
    settings-link
  />

  <PageStateNotice
    v-else-if="status === 'error' && dataEmpty"
    kind="error"
    :message="error || labels.noticeError"
    retryable
    @retry="emit('retry')"
  />
</template>

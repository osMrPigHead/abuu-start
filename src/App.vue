<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterView } from 'vue-router'
import builtinBackgroundUrl from '@/assets/backgrounds/background.png'
import { useBackground } from '@/composables/useBackground'

const { state, hydrate, imageUrl, markLoaded, markFailed } = useBackground()
const loadedSrc = ref<string | null>(null)

/** 自定义背景已配置且未回退；加载中或换图时也不应露出内置图。 */
const customActive = computed(() => state.configured && !state.fallback)
const customName = computed(() => (customActive.value ? state.selectedName : null))
const customSrc = computed(() => (customName.value ? imageUrl(customName.value) : null))

/** 空值表示正在等待清单或自定义图，不渲染任何背景图。 */
const backgroundSrc = computed(() => {
  if (customSrc.value) return customSrc.value
  if (state.hydrated && !customActive.value) return builtinBackgroundUrl
  return null
})

const isBuiltinBackground = computed(() => backgroundSrc.value === builtinBackgroundUrl)
const backgroundLoaded = computed(
  () =>
    isBuiltinBackground.value ||
    (backgroundSrc.value !== null && loadedSrc.value === backgroundSrc.value),
)

// 换图或回退时先清除上一张的加载状态，保证新图重新渐入。
watch(backgroundSrc, () => {
  loadedSrc.value = null
})

function onBackgroundLoad(): void {
  const src = backgroundSrc.value
  if (!src) return

  loadedSrc.value = src
  const name = customName.value
  if (name && src === customSrc.value) markLoaded(name)
}

function onBackgroundError(): void {
  const name = customName.value
  if (name) markFailed(name)
}

onMounted(() => {
  void hydrate()
})
</script>

<template>
  <div class="app-shell">
    <img
      v-if="backgroundSrc"
      :key="backgroundSrc"
      :src="backgroundSrc"
      class="app-background-image"
      :class="{ 'is-loaded': backgroundLoaded }"
      alt=""
      aria-hidden="true"
      draggable="false"
      decoding="async"
      @load="onBackgroundLoad"
      @error="onBackgroundError"
    >
    <div class="app-content">
      <RouterView />
    </div>
  </div>
</template>
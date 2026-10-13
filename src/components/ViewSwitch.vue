<template>
  <!-- What the picture shows: the paint, the colours of the photo, the photo over the paint, the photo, the empty template. -->
  <div class="segmented viewswitch">
    <button
      v-for="v in views"
      :key="v.value"
      type="button"
      class="segmented__option"
      :class="{ 'segmented__option--active': analysis.settings.view === v.value }"
      :aria-pressed="analysis.settings.view === v.value"
      :title="v.label"
      @click="analysis.settings.view = v.value"
    >
      <AppIcon :name="v.icon" :label="v.label" />
    </button>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import AppIcon from './AppIcon.vue'

const analysis = useAnalysisStore()
// Layer mode has no colour per area to compare with, only the layered picture and the photo.
// The Sketch view is hidden for now (TASK-39: it is to be reworked); its drawing is still there.
const views = computed(() =>
  analysis.layerMode
    ? [
        { value: 'mixed', label: 'Layered paint', icon: 'mixed' },
        { value: 'overlay', label: 'Overlay: the photo at half strength over the paint', icon: 'overlay' },
        { value: 'original', label: 'Photo', icon: 'photo' },
      ]
    : [
        { value: 'mixed', label: 'Mixed paint', icon: 'mixed' },
        { value: 'target', label: 'Photo colour', icon: 'colours' },
        { value: 'overlay', label: 'Overlay: the photo at half strength over the paint', icon: 'overlay' },
        { value: 'original', label: 'Photo', icon: 'photo' },
        { value: 'template', label: 'Template to print: areas and numbers in light grey, nothing filled in', icon: 'print' },
      ],
)
// A view that has no button (the sketch of a saved picture) falls back to the paint.
watch(
  () => [analysis.settings.view, views.value],
  () => {
    if (!views.value.some((v) => v.value === analysis.settings.view)) analysis.settings.view = 'mixed'
  },
  { immediate: true },
)
</script>

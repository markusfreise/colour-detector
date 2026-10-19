<template>
  <!-- What the picture shows: the paint, the colours of the photo, the photo, the blocking. -->
  <div class="segmented viewswitch">
    <button
      v-for="v in views"
      :key="v.value"
      type="button"
      class="segmented__option"
      :class="{
        'segmented__option--active': analysis.settings.view === v.value,
        'segmented__option--locked': v.value === 'blocking' && !pro.can('blocking'),
      }"
      :aria-pressed="analysis.settings.view === v.value"
      :data-hint="t(v.hint)"
      @click="choose(v.value)"
    >
      <AppIcon :name="v.icon" :label="t(v.label)" />
    </button>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import AppIcon from './AppIcon.vue'
import { useProStore } from '../stores/pro.js'
import { trackEvent } from '../lib/analytics.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const analysis = useAnalysisStore()
const pro = useProStore()
// Light and shadow in large masses, to start a painting from (lib/blocking.js).
const BLOCKING = { value: 'blocking', label: 'Blocking: light and shadow in large masses', hint: 'Blocking', icon: 'blocking' }
// Layer mode has no colour per area to compare with, only the layered picture and the photo.
// The Sketch view is hidden for now (TASK-39: it is to be reworked); its drawing is still there.
// So is the Template view: the grid over the picture takes its place; and the Overlay view, for a
// toolbar that fits on a phone. Their drawing is still there.
const views = computed(() =>
  analysis.layerMode
    ? [
        { value: 'mixed', label: 'Layered paint', hint: 'Layered paint', icon: 'mixed' },
        { value: 'original', label: 'Photo', hint: 'Photo', icon: 'photo' },
        BLOCKING,
      ]
    : [
        { value: 'mixed', label: 'Mixed paint', hint: 'Mixed paint', icon: 'mixed' },
        { value: 'target', label: 'Photo colour', hint: 'Photo colour', icon: 'colours' },
        { value: 'original', label: 'Photo', hint: 'Photo', icon: 'photo' },
        BLOCKING,
      ],
)
// Blocking is a picture feature: a credit on the picture or a plan.
function choose(view) {
  if (view === analysis.settings.view) return
  if (view === 'blocking') {
    if (!pro.require('blocking', 'block in light and shadow')) return
    trackEvent('blocking_opened', { mode: analysis.settings.mode })
  }
  analysis.settings.view = view
}
// A picture without it (another photo opened, a plan ended) leaves the view.
watch(
  () => analysis.settings.view === 'blocking' && !pro.can('blocking'),
  (locked) => {
    if (locked) analysis.settings.view = 'mixed'
  },
  { immediate: true },
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

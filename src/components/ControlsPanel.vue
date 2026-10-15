<template>
  <section class="panel sidebar" :class="{ 'panel--collapsed': collapsed }">
    <div class="toolbar">
      <PanelToggle name="controls" label="the settings" />
    <p v-if="analysis.error" class="controls__error">{{ analysis.error }}</p>
  </div>

        <!-- The settings float over the picture: dragged by the handle, their place is remembered. -->
        <div v-if="!collapsed" ref="panel" class="flyout flyout--floating" :class="{ 'flyout--dragging': dragging }" :style="style">
          <div class="flyout__handle" :title="t('Drag to move the settings')" @pointerdown="startDrag"></div>
          <button class="flyout__close" type="button" :title="t('Close')" :aria-label="t('Close the settings')" @click="layout.toggle('controls')">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
            </svg>
          </button>
          <div class="field__label">
            <div class="segmented__group">
              <div class="segmented segmented--fill">
                <button
                  v-for="m in methods"
                  :key="m.value"
                  type="button"
                  class="segmented__option"
                  :class="{ 'segmented__option--active': analysis.settings.mode === m.value }"
                  :aria-pressed="analysis.settings.mode === m.value"
                  :title="t(m.title)"
                  @click="analysis.setMode(m.value)"
                >
                  <AppIcon :name="m.icon" :label="t(m.label)" />
                </button>
              </div>
        <div class="segmented segmented--fill">
          <button
            v-for="a in areas"
            :key="a.label"
            type="button"
            class="segmented__option"
            :class="{ 'segmented__option--active': analysis.settings.geometric === a.value }"
            :aria-pressed="analysis.settings.geometric === a.value"
            :title="t(a.title)"
            @click="setGeometric(a.value)"
          >
            <AppIcon v-if="icons[a.icon]" :name="a.icon" :label="t(a.label)" />
            <template v-else>{{ t(a.label) }}</template>
          </button>
        </div>
        <!-- A value study: the picture in grey, each value painted with one colour of the paint box. -->
        <button
          type="button"
          class="button"
          :class="{ 'button--active': analysis.valueMode }"
          :aria-pressed="analysis.valueMode"
          :disabled="analysis.layerMode"
          :title="t('Values: the picture in grey, each value painted with one colour of the paint box')"
          @click="setValues(!analysis.settings.values)"
        >
          <AppIcon name="contrast" :label="t('Values')" />
        </button>
        </div>
            <span class="controls__toggles">
                <label v-if="analysis.settings.view === 'sketch'" class="checkbox" :title="t('Quarters and diagonals, to transfer the sketch to paper')">
                <input v-model="analysis.settings.guides" type="checkbox" /> {{ t('Guides') }}
              </label>
            </span>
          </div>
          <label class="field">
            <span class="field__label">{{ t('Simplify areas') }} <output class="field__value">{{ simplifyShown }}</output></span>
            <input
              :value="analysis.settings[simplifyKey]"
              class="field__range"
              type="range"
              :min="analysis.layerMode ? 0 : FINEST"
              max="10"
              :title="analysis.layerMode || pro.active ? undefined : t('Below 0 with Pro')"
              @input="setSimplify($event)"
              @change="simplifyChanged"
            />
          </label>
        <div class="controls__settings">
          <label v-if="!analysis.layerMode" class="field">
            <span class="field__label">{{ t('Colours') }} <output class="field__value">{{ analysis.settings.colours }}</output></span>
            <input
              v-model.number="analysis.settings.colours"
              class="field__range"
              type="range"
              min="2"
              max="32"
              @change="analysis.analyse()"
            />
          </label>
          <label v-else class="field">
            <span class="field__label">{{ t('Layers') }} <output class="field__value">{{ layerCount }}</output></span>
            <input
              v-model.number="analysis.settings.layerCount"
              class="field__range"
              type="range"
              min="2"
              :max="MAX_LAYER_PAINTS"
              :disabled="!paints.activeBox.layerAuto"
              @change="analysis.analyse()"
            />
            <span class="field__hint">
              {{ paints.activeBox.layerAuto ? t('Washes; accents and second coats are extra steps') : t('Chosen by hand. Auto in the paint box picks again.') }}
            </span>
          </label>
    
          <label v-if="!analysis.layerMode" class="field">
            <span class="field__label">{{ t('Details') }} <output class="field__value">{{ analysis.settings.variety }}</output></span>
            <input
              v-model.number="analysis.settings.variety"
              class="field__range"
              type="range"
              min="0"
              max="10"
              @change="analysis.analyse()"
            />
          </label>
          <label v-else class="field">
            <span class="field__label">{{ t('Accents') }} <output class="field__value">{{ analysis.settings.layerAccents }}</output></span>
            <input
              v-model.number="analysis.settings.layerAccents"
              class="field__range"
              type="range"
              min="0"
              max="3"
              @change="analysis.analyse()"
            />
          </label>
    
          <div v-if="!analysis.layerMode" class="field">
            <span class="field__label">{{ t('Max. paints') }}<output class="field__value">{{ analysis.settings.maxPaints }}</output></span>
            <input
              v-model.number="analysis.settings.maxPaints"
              class="field__range"
              type="range"
              min="1"
              max="3"
              @change="analysis.analyse()"
            />
          </div>
          <label v-else class="field" :title="t('How often one wash may be painted over itself')">
            <span class="field__label">{{ t('Max. coats') }} <output class="field__value">{{ analysis.settings.maxCoats }}</output></span>
            <input
              v-model.number="analysis.settings.maxCoats"
              class="field__range"
              type="range"
              min="1"
              max="3"
              @change="analysis.analyse()"
            />
          </label>
        </div>
        <span v-if="analysis.layerMode" class="field__hint controls__hint">
          {{ t('Accents: small strong touches painted last, first for a colour the washes miss, then for the darks') }}
        </span>
    
        <div class="controls__settings controls__settings_two">
          <label class="field">
            <span class="field__label">{{ t('Saturation') }} <output class="field__value">{{ analysis.settings.saturation }}%</output></span>
            <input
              v-model.number="analysis.settings.saturation"
              class="field__range"
              type="range"
              min="0"
              max="200"
              step="5"
              @change="analysis.analyse()"
              @dblclick="resetAdjustment('saturation')"
            />
          </label>
          <label class="field">
            <span class="field__label">{{ t('Contrast') }} <output class="field__value">{{ analysis.settings.contrast }}%</output></span>
            <input
              v-model.number="analysis.settings.contrast"
              class="field__range"
              type="range"
              min="50"
              max="200"
              step="5"
              @change="analysis.analyse()"
              @dblclick="resetAdjustment('contrast')"
            />
          </label>
        </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { useCollectionStore } from '../stores/collection.js'
import { usePaintsStore, MAX_LAYER_PAINTS } from '../stores/paints.js'
import { useLayoutStore } from '../stores/layout.js'
import PanelToggle from './PanelToggle.vue'
import { FINEST, SIMPLIFY_ZERO } from '../lib/segment.js'
import { useProStore } from '../stores/pro.js'
import AiPanel from './AiPanel.vue'
import { useFloating } from './floating.js'
import AppIcon from './AppIcon.vue'
import { icons } from './icons.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const analysis = useAnalysisStore()
const collection = useCollectionStore()
const layout = useLayoutStore()
const collapsed = computed(() => !!layout.collapsed.controls)
const { panel, style, dragging, startDrag } = useFloating('settings')
const paints = usePaintsStore()
const areas = [
  { value: false, label: 'Organic', icon: 'organic', title: 'Organic: areas follow the outlines in the photo' },
  { value: true, label: 'Geometric', icon: 'geometric', title: 'Geometric: areas as polygons with a few straight edges that overlap' }
]
function setValues(on) {
  analysis.settings.values = on
  analysis.analyse()
}
function setGeometric(value) {
  if (analysis.settings.geometric === value) return
  analysis.settings.geometric = value
  analysis.analyse()
}
const methods = [
  { value: 'mix', label: 'Mix', icon: 'brush', title: 'Mix: every colour is mixed on the palette and each area painted once' },
  { value: 'layer', label: 'Layer@@mode', icon: 'layers', title: 'Layer: a few paints glazed over each other, light to dark' },
]
// Layer mode keeps its own smoothing: its areas are painted several times over.
const simplifyKey = computed(() => (analysis.layerMode ? 'layerSimplify' : 'simplify'))
// In mix mode the scale is shown from SIMPLIFY_ZERO on, so its finer steps read -1 and -2.
const simplifyShown = computed(() => analysis.settings[simplifyKey.value] - (analysis.layerMode ? 0 : SIMPLIFY_ZERO))
// The steps below the shown 0 are Pro: without it the slider stops at 0 and the plans come up.
const pro = useProStore()
let wantedFiner = false
function setSimplify(event) {
  let value = Number(event.target.value)
  wantedFiner = !analysis.layerMode && !pro.active && value < SIMPLIFY_ZERO
  if (wantedFiner) {
    value = SIMPLIFY_ZERO
    event.target.value = value
  }
  analysis.settings[simplifyKey.value] = value
}
function simplifyChanged() {
  if (wantedFiner) pro.require(false, 'make the areas finer than Simplify 0')
  wantedFiner = false
  analysis.analyse()
}
// On Auto the slider says how many paints to propose; by hand it shows how many were chosen.
const layerCount = computed(() => (paints.activeBox.layerAuto ? analysis.settings.layerCount : paints.activeBox.layerIds.length))

// Saturation and contrast back to the photo as it is.
function resetAdjustment(...keys) {
  for (const key of keys) analysis.settings[key] = 100
  analysis.analyse()
}

function setMaxPaints(n) {
  analysis.settings.maxPaints = n
  analysis.autoPaints()
  analysis.recomputeAllRecipes()
}
</script>

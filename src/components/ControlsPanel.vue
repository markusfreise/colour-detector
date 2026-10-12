<template>
  <section class="panel controls" :class="{ 'panel--collapsed': collapsed }">
    <div class="controls__image">
      <span class="controls__image-name" :title="analysis.imageName">{{ analysis.imageName }}</span>
      <span v-if="analysis.savedId" class="controls__saved">In collection</span>
      <div class="controls__actions">
        <label class="button button--secondary" title="Choose a photo">
          New
          <input class="controls__file" type="file" accept="image/*" @change="onFile" />
        </label>
        <label v-if="hasCamera" class="button button--secondary">
          Take photo
          <input class="controls__file" type="file" accept="image/*" capture="environment" @change="onFile" />
        </label>
        <button class="button button--ghost" type="button" title="Load the next sample photo" @click="analysis.loadSample()">
          Sample
        </button>
        <button class="button button--ghost" type="button" :disabled="!analysis.image" @click="collection.saveCurrent()">
          Save
        </button>
        <button class="button button--ghost" type="button" @click="emit('show-collection')">Collection</button>
        <button class="button button--ghost" type="button" :disabled="!printable" @click="print">Print / PDF</button>
      </div>
      <PanelToggle name="controls" label="the settings" />
    </div>
    <div v-show="!collapsed" class="controls__body">
    <p v-if="collection.error" class="controls__error">{{ collection.error }}</p>

    <div class="field">
      <span class="field__label">Method</span>
      <div class="segmented segmented--fill">
        <button
          v-for="m in methods"
          :key="m.value"
          type="button"
          class="segmented__option"
          :class="{ 'segmented__option--active': analysis.settings.mode === m.value }"
          :aria-pressed="analysis.settings.mode === m.value"
          :title="m.title"
          @click="analysis.setMode(m.value)"
        >
          {{ m.label }}
        </button>
      </div>
      <span v-if="analysis.layerMode" class="field__hint">Layer: a few thin washes, each painted over the dry one before.</span>
    </div>

    <!-- The areas: their kind and how calm they are. -->
    <div class="controls__pair">
      <div class="field">
        <span class="field__label">Areas</span>
        <div class="segmented segmented--fill">
          <button
            v-for="a in areas"
            :key="a.label"
            type="button"
            class="segmented__option"
            :class="{ 'segmented__option--active': analysis.settings.geometric === a.value }"
            :aria-pressed="analysis.settings.geometric === a.value"
            :title="a.title"
            @click="setGeometric(a.value)"
          >
            {{ a.label }}
          </button>
        </div>
        <span v-if="analysis.settings.geometric" class="field__hint">Geometric: shapes with straight edges, laid over each other from large to small.</span>
      </div>
      <label class="field">
        <span class="field__label">Simplify areas <output class="field__value">{{ analysis.settings[simplifyKey] }}</output></span>
        <input
          v-model.number="analysis.settings[simplifyKey]"
          class="field__range"
          type="range"
          min="0"
          max="10"
          @change="analysis.analyse()"
        />
      </label>
    </div>

    <div class="field">
      <div class="field__label">
        Show
        <span class="controls__toggles">
          <label v-if="analysis.settings.view === 'sketch'" class="checkbox" title="Quarters and diagonals, to transfer the sketch to paper">
            <input v-model="analysis.settings.guides" type="checkbox" /> Guides
          </label>
          <label class="checkbox"><input v-model="analysis.settings.outlines" type="checkbox" /> Outlines</label>
          <label class="checkbox"><input v-model="analysis.settings.numbers" type="checkbox" /> Numbers</label>
        </span>
      </div>
      <div class="segmented segmented--fill">
        <button
          v-for="v in views"
          :key="v.value"
          type="button"
          class="segmented__option"
          :class="{ 'segmented__option--active': analysis.settings.view === v.value }"
          @click="analysis.settings.view = v.value"
        >
          {{ v.label }}
        </button>
      </div>
    </div>

    <div class="controls__settings">
      <label v-if="!analysis.layerMode" class="field">
        <span class="field__label">Colours <output class="field__value">{{ analysis.settings.colours }}</output></span>
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
        <span class="field__label">Layers <output class="field__value">{{ layerCount }}</output></span>
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
          {{ paints.activeBox.layerAuto ? 'Washes; accents and second coats are extra steps' : 'Chosen by hand. Auto in the paint box picks again.' }}
        </span>
      </label>

      <label v-if="!analysis.layerMode" class="field">
        <span class="field__label">Details <output class="field__value">{{ analysis.settings.variety }}</output></span>
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
        <span class="field__label">Accents <output class="field__value">{{ analysis.settings.layerAccents }}</output></span>
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
        <span class="field__label">Max. paints</span>
        <div class="segmented segmented--fill">
          <button
            v-for="n in [1, 2, 3]"
            :key="n"
            type="button"
            class="segmented__option"
            :class="{ 'segmented__option--active': analysis.settings.maxPaints === n }"
            @click="setMaxPaints(n)"
          >
            {{ n }}
          </button>
        </div>
      </div>
      <div v-else class="field">
        <span class="field__label">Max. coats</span>
        <div class="segmented segmented--fill">
          <button
            v-for="n in [1, 2, 3]"
            :key="n"
            type="button"
            class="segmented__option"
            :class="{ 'segmented__option--active': analysis.settings.maxCoats === n }"
            :aria-pressed="analysis.settings.maxCoats === n"
            title="How often one wash may be painted over itself"
            @click="setMaxCoats(n)"
          >
            {{ n }}
          </button>
        </div>
      </div>
    </div>
    <span v-if="analysis.layerMode" class="field__hint controls__hint">
      Accents: small strong touches painted last, first for a colour the washes miss, then for the darks
    </span>

    <div class="controls__settings">
      <label class="field">
        <span class="field__label">Saturation <output class="field__value">{{ analysis.settings.saturation }}%</output></span>
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
        <span class="field__label">Contrast <output class="field__value">{{ analysis.settings.contrast }}%</output></span>
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

      <div class="field controls__reset-slot">
        <button
          v-if="analysis.settings.saturation !== 100 || analysis.settings.contrast !== 100"
          class="button button--ghost controls__reset"
          type="button"
          title="Saturation and contrast back to the photo as it is"
          @click="resetAdjustment('saturation', 'contrast')"
        >
          Reset
        </button>
      </div>
    </div>
    <AiPanel />
    </div>
    <p v-if="analysis.error" class="controls__error">{{ analysis.error }}</p>
  </section>
</template>

<script setup>
import { computed, nextTick } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { useCollectionStore } from '../stores/collection.js'
import { usePaintsStore, MAX_LAYER_PAINTS } from '../stores/paints.js'
import { useLayoutStore } from '../stores/layout.js'
import PanelToggle from './PanelToggle.vue'
import { isNative, sendNative } from '../lib/native.js'
import AiPanel from './AiPanel.vue'

const emit = defineEmits(['show-collection'])
const analysis = useAnalysisStore()
const collection = useCollectionStore()
const layout = useLayoutStore()
const collapsed = computed(() => !!layout.collapsed.controls)
// "Take photo" opens the camera directly; that only exists on phones and tablets.
const hasCamera = window.matchMedia?.('(pointer: coarse)').matches ?? false
const paints = usePaintsStore()
const areas = [
  { value: false, label: 'Organic', title: 'Areas follow the outlines in the photo' },
  { value: true, label: 'Geometric', title: 'Areas as polygons with a few straight edges that overlap' },
]
function setGeometric(value) {
  if (analysis.settings.geometric === value) return
  analysis.settings.geometric = value
  analysis.analyse()
}
const methods = [
  { value: 'mix', label: 'Mix', title: 'Mix every colour on the palette and paint each area once' },
  { value: 'layer', label: 'Layer', title: 'Glaze a few paints over each other, light to dark' },
]
// Layer mode has no colour per area to compare with, only the layered picture and the photo.
const views = computed(() =>
  analysis.layerMode
    ? [
        { value: 'mixed', label: 'Layered paint' },
        { value: 'original', label: 'Photo' },
        { value: 'sketch', label: 'Sketch' },
      ]
    : [
        { value: 'mixed', label: 'Mixed paint' },
        { value: 'target', label: 'Photo colour' },
        { value: 'original', label: 'Photo' },
        { value: 'sketch', label: 'Sketch' },
      ],
)
// Layer mode keeps its own smoothing: its areas are painted several times over.
const simplifyKey = computed(() => (analysis.layerMode ? 'layerSimplify' : 'simplify'))
// On Auto the slider says how many paints to propose; by hand it shows how many were chosen.
const layerCount = computed(() => (paints.activeBox.layerAuto ? analysis.settings.layerCount : paints.activeBox.layerIds.length))

// Something to print: colours in mix mode, a plan of layers in layer mode.
const printable = computed(() => (analysis.layerMode ? !!analysis.layers : analysis.entries.length > 0))

// The print stylesheet lays out the sheet; the browser's dialog offers "Save as PDF".
async function print() {
  // window.print() does nothing inside the app's web view; the shell prints it instead.
  if (isNative) return sendNative('print')
  // The sheets of layer mode are built on `beforeprint`, but the page only renders them a tick
  // later, which is too late for the print snapshot. So build them first, then print.
  window.dispatchEvent(new Event('beforeprint'))
  await nextTick()
  window.print()
}

function onFile(event) {
  const file = event.target.files?.[0]
  if (file) analysis.loadFile(file)
  event.target.value = ''
}

// Saturation and contrast back to the photo as it is.
function resetAdjustment(...keys) {
  for (const key of keys) analysis.settings[key] = 100
  analysis.analyse()
}

function setMaxCoats(n) {
  analysis.settings.maxCoats = n
  analysis.analyse()
}

function setMaxPaints(n) {
  analysis.settings.maxPaints = n
  analysis.autoPaints()
  analysis.recomputeAllRecipes()
}
</script>

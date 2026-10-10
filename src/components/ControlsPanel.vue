<template>
  <section class="panel controls">
    <div class="controls__image">
      <span class="controls__image-name" :title="analysis.imageName">{{ analysis.imageName }}</span>
      <span v-if="analysis.savedId" class="controls__saved">In collection</span>
    </div>
    <div class="controls__actions">
      <label class="button button--secondary">
        Choose photo
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
    </div>
    <p v-if="collection.error" class="controls__error">{{ collection.error }}</p>

    <div class="controls__settings">
      <label class="field">
        <span class="field__label">Colours <output class="field__value">{{ analysis.settings.colours }}</output></span>
        <input
          v-model.number="analysis.settings.colours"
          class="field__range"
          type="range"
          min="2"
          max="32"
          @change="analysis.analyse()"
        />
        <span class="field__hint">More colours = more detail</span>
      </label>

      <label class="field">
        <span class="field__label">Simplify areas <output class="field__value">{{ analysis.settings.simplify }}</output></span>
        <input
          v-model.number="analysis.settings.simplify"
          class="field__range"
          type="range"
          min="0"
          max="10"
          @change="analysis.analyse()"
        />
        <span class="field__hint">Higher = bigger, calmer shapes</span>
      </label>

      <div class="field">
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
    </div>

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

      <label class="field">
        <span class="field__label">Variety <output class="field__value">{{ analysis.settings.variety }}</output></span>
        <input
          v-model.number="analysis.settings.variety"
          class="field__range"
          type="range"
          min="0"
          max="10"
          @change="analysis.analyse()"
        />
      </label>
    </div>
    <div class="controls__hints">
      <span class="field__hint">Variety: lower = closer overall, higher = small areas keep their own colour</span>
      <button
        v-if="analysis.settings.saturation !== 100 || analysis.settings.contrast !== 100"
        class="button button--ghost controls__reset"
        type="button"
        @click="resetAdjustment('saturation', 'contrast')"
      >
        Reset saturation and contrast
      </button>
    </div>

    <div class="field">
      <div class="field__label">
        Show
        <span class="controls__toggles">
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
    <p v-if="analysis.error" class="controls__error">{{ analysis.error }}</p>
  </section>
</template>

<script setup>
import { useAnalysisStore } from '../stores/analysis.js'
import { useCollectionStore } from '../stores/collection.js'

const emit = defineEmits(['show-collection'])
const analysis = useAnalysisStore()
const collection = useCollectionStore()
// "Take photo" opens the camera directly; that only exists on phones and tablets.
const hasCamera = window.matchMedia?.('(pointer: coarse)').matches ?? false
const views = [
  { value: 'mixed', label: 'Mixed paint' },
  { value: 'target', label: 'Photo colour' },
  { value: 'original', label: 'Photo' },
]

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

function setMaxPaints(n) {
  analysis.settings.maxPaints = n
  analysis.autoPaints()
  analysis.recomputeAllRecipes()
}
</script>

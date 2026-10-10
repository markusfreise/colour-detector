<template>
  <section class="panel controls">
    <div class="controls__image">
      <span class="controls__image-name" :title="analysis.imageName">{{ analysis.imageName }}</span>
      <label class="button button--secondary">
        Upload photo
        <input class="controls__file" type="file" accept="image/*" @change="onFile" />
      </label>
      <button class="button button--ghost" type="button" @click="analysis.loadSample()">Sample</button>
    </div>

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

const analysis = useAnalysisStore()
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

function setMaxPaints(n) {
  analysis.settings.maxPaints = n
  analysis.recomputeAllRecipes()
}
</script>

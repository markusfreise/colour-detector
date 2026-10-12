<template>
  <section v-if="entry" ref="panel" class="panel editor" :class="{ 'editor--dragging': dragging }" :style="style">
    <!-- The header is the handle: on a wide window the panel floats over the page and is dragged by it. -->
    <header class="editor__header" @pointerdown="startDrag">
      <h2 class="panel__title">Colour {{ entry.label }}</h2>
      <button class="button button--ghost" type="button" @click="analysis.selectEntry(null)">Close</button>
    </header>

    <div class="editor__body">
    <div class="editor__compare">
      <div class="editor__swatch">
        <span class="chip editor__chip" :style="chipStyle(entry.targetHex)">
          <span class="chip__text">{{ entry.targetHex }}</span>
        </span>
        <span class="editor__caption">Target</span>
      </div>
      <div class="editor__swatch">
        <span class="chip editor__chip" :style="chipStyle(recipe?.hex)">
          <span class="chip__text">{{ recipe?.hex }}</span>
        </span>
        <span class="editor__caption">Your mix</span>
      </div>
    </div>

    <div class="editor__target">
      <label class="editor__picker">
        <input type="color" :value="entry.targetHex" @change="onPick" />
        <span>Change colour</span>
      </label>
      <button v-if="entry.overridden" class="button button--ghost" type="button" @click="analysis.resetTarget(index)">
        Reset to photo
      </button>
    </div>
    <button
      v-if="analysis.selectedRegion != null && sharedAreas > 1"
      class="button button--secondary editor__detach"
      type="button"
      @click="analysis.detachRegion(analysis.selectedRegion)"
    >
      Edit only the clicked area
    </button>

    <h3 class="editor__subtitle">Recipes</h3>
    <p v-if="washes.length" class="editor__washes">
      Same mix as {{ washes.join(', ') }} – only the amount of water differs.
    </p>
    <ul class="editor__recipes">
      <li
        v-for="(r, i) in entry.recipes"
        :key="i"
        class="editor__recipe"
        :class="{ 'editor__recipe--active': entry.chosen === i }"
        @click="analysis.chooseRecipe(index, i)"
      >
        <RecipeLine :recipe="r" />
      </li>
    </ul>
    <p v-if="!entry.recipes.length" class="editor__empty">No paints selected in the paint box.</p>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, watch } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { chipStyle } from '../lib/color.js'
import RecipeLine from './RecipeLine.vue'
import { useFloating } from './floating.js'

const analysis = useAnalysisStore()
const index = computed(() => analysis.selectedEntry)
const entry = computed(() => analysis.selected)
const recipe = computed(() => entry.value?.recipes[entry.value.chosen])

const { panel, style, dragging, startDrag, floats } = useFloating('editor')
// An area clicked in the picture brings its colour into view; in one column the panel may be below the fold.
watch(
  () => analysis.selectedRegion,
  async (region) => {
    if (region == null) return
    await nextTick()
    if (!floats()) panel.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  },
)
const sharedAreas = computed(() => {
  if (!analysis.regionEntry || index.value == null) return 0
  analysis.renderVersion // re-evaluate after detaching
  let n = 0
  for (const e of analysis.regionEntry) if (e === index.value) n++
  return n
})

// Labels of the other colours painted with this mix.
const washes = computed(() => {
  if (!entry.value) return []
  return analysis.order.map((i) => analysis.entries[i]).filter((e) => e !== entry.value && e.family === entry.value.family).map((e) => e.label)
})

function onPick(event) {
  analysis.setTarget(index.value, event.target.value)
}
</script>

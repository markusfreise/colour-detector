<template>
  <!-- The colour being looked at, in full: what the photo asks for against what the paints give,
       the colour by hand, and every recipe. It is the content of the breakdown (ColourBreakdown.vue). -->
  <div v-if="entry" class="editor">
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
      v-if="region != null && sharedAreas > 1"
      class="button button--secondary editor__detach"
      type="button"
      @click="analysis.detachRegion(region)"
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
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { chipStyle } from '../lib/color.js'
import RecipeLine from './RecipeLine.vue'

const analysis = useAnalysisStore()
const index = computed(() => analysis.inspected?.entry ?? null)
// The area that was tapped, when the colour was reached through the picture: only then can that
// one area be taken out of the mix.
const region = computed(() => analysis.inspected?.region ?? null)
const entry = computed(() => analysis.inspectedColour)
const recipe = computed(() => entry.value?.recipes[entry.value.chosen])

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

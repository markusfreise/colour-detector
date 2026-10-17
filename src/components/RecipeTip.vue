<template>
  <div v-if="entry" ref="tip" class="tip" :style="style" role="tooltip">
    <div class="tip__header">
      <span class="swatch swatch--small" :style="{ background: recipe?.hex ?? entry.targetHex }"></span>
      <strong>{{ t('Colour {label}', { label: entry.label }) }}</strong>
      <span class="tip__share">{{ t('{percent}% of image', { percent: Math.round(entry.share * 100) || '<1' }) }}</span>
    </div>
    <!-- The recommended recipe as in the recipe panel: wash and match, the paints with their parts, the ratio as a bar. -->
    <RecipeLine v-if="recipe" :recipe="recipe" full :forms="false" />
    <p v-else class="tip__paper">{{ t('No paints selected in the paint box') }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, onUpdated, reactive, ref } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import RecipeLine from './RecipeLine.vue'
import { useText } from '../i18n/index.js'

const { t } = useText()
const props = defineProps({
  // The palette entry under the pointer, or null.
  index: { type: Number, default: null },
  // The pointer in the window.
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
})

const OFFSET = 18 // clear of the pointer
const MARGIN = 8 // what stays between the tip and the edge of the window

const analysis = useAnalysisStore()
const entry = computed(() => (props.index == null ? null : analysis.entries[props.index] ?? null))
// The recommended recipe: the one chosen for this colour in the list.
const recipe = computed(() => entry.value?.recipes[entry.value.chosen] ?? null)
// Below and right of the pointer, or on the other side of it where there is no room; and never
// outside the window, however narrow that is. The tip is measured once it is drawn: its size
// depends on the recipe and on the width of the window.
const tip = ref(null)
const size = reactive({ width: 0, height: 0 })
function measure() {
  if (!tip.value) return
  size.width = tip.value.offsetWidth
  size.height = tip.value.offsetHeight
}
onMounted(measure)
onUpdated(measure)
const place = (at, length, room) => {
  const after = at + OFFSET, before = at - OFFSET - length
  const wanted = after + length + MARGIN <= room || before < MARGIN ? after : before
  return Math.max(MARGIN, Math.min(wanted, room - length - MARGIN))
}
const style = computed(() => ({
  left: `${place(props.x, size.width, window.innerWidth)}px`,
  top: `${place(props.y, size.height, window.innerHeight)}px`,
  // Not shown before its size is known, so that it does not jump.
  visibility: size.width ? 'visible' : 'hidden',
}))
</script>

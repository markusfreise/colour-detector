<template>
  <section class="panel paintbox">
    <header class="paintbox__header">
      <h2 class="panel__title">
        Paint box <small class="panel__count">{{ paints.enabledIds.size }}/{{ paints.all.length }}</small>
      </h2>
      <div class="paintbox__actions">
        <button class="button button--ghost" type="button" @click="paints.reset()">Reset</button>
        <button class="button button--secondary" type="button" :disabled="!dirty" @click="apply">
          Update mixes
        </button>
      </div>
    </header>
    <div v-for="group in paints.groups" :key="group.key" class="paintbox__group">
      <h3 class="paintbox__group-title">
        {{ group.name }}
        <button class="paintbox__bulk" type="button" @click="bulk(group, true)">all</button>
        <button class="paintbox__bulk" type="button" @click="bulk(group, false)">none</button>
      </h3>
      <div v-for="family in group.families" :key="family.key" class="paintbox__family">
        <h4 class="paintbox__family-title">{{ family.name }}</h4>
        <ul class="paintbox__list">
          <li
            v-for="p in family.paints"
            :key="p.id"
            class="paintbox__paint"
            :class="{ 'paintbox__paint--used': analysis.usedPaintIds.has(p.id) }"
          >
            <label class="chip paintbox__chip" :style="chipStyle(p.hex)" :title="describe(p)">
              <input
                class="paintbox__checkbox"
                type="checkbox"
                :checked="paints.enabledIds.has(p.id)"
                @change="toggle(p.id, $event.target.checked)"
              />
              <span class="paintbox__toggle"></span>
              <span class="chip__strong">{{ paintNumber(p.number) }}</span>
              <span class="chip__text paintbox__name">{{ p.name }}</span>
            </label>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { usePaintsStore } from '../stores/paints.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { chipStyle } from '../lib/color.js'
import { paintNumber } from '../lib/paintbox.js'

const paints = usePaintsStore()
const analysis = useAnalysisStore()
const dirty = ref(false)

// Tooltip: vendor line, German name, and the stock notes that no longer fit on the chip.
function describe(p) {
  const parts = [`${p.vendor} ${p.line}`, p.nameDe]
  if (p.source === 'estimate') parts.push('colour estimated')
  if (p.note) parts.push(p.note)
  return parts.filter(Boolean).join(' · ')
}

function toggle(id, on) {
  paints.toggle(id, on)
  dirty.value = true
}

function bulk(group, on) {
  paints.setAll(group.paints.map((p) => p.id), on)
  dirty.value = true
}

function apply() {
  analysis.recomputeAllRecipes()
  dirty.value = false
}
</script>

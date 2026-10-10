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
    <div v-for="group in paints.groups" :key="group.name" class="paintbox__group">
      <h3 class="paintbox__group-title">
        {{ group.name }}
        <button class="paintbox__bulk" type="button" @click="bulk(group, true)">all</button>
        <button class="paintbox__bulk" type="button" @click="bulk(group, false)">none</button>
      </h3>
      <ul class="paintbox__list">
        <li
          v-for="p in group.paints"
          :key="p.id"
          class="paintbox__paint"
          :class="{
            'paintbox__paint--off': !paints.enabledIds.has(p.id),
            'paintbox__paint--used': analysis.usedPaintIds.has(p.id),
          }"
        >
          <label class="paintbox__label" :title="p.note || p.nameDe">
            <input
              type="checkbox"
              :checked="paints.enabledIds.has(p.id)"
              @change="toggle(p.id, $event.target.checked)"
            />
            <span class="swatch swatch--small" :style="{ background: p.hex }"></span>
            <span class="paintbox__name">{{ p.name }}</span>
            <small class="paintbox__number">{{ p.number }}</small>
            <small v-if="p.source === 'estimate'" class="paintbox__flag">est.</small>
            <small v-if="p.note" class="paintbox__flag paintbox__flag--note">!</small>
          </label>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { usePaintsStore } from '../stores/paints.js'
import { useAnalysisStore } from '../stores/analysis.js'

const paints = usePaintsStore()
const analysis = useAnalysisStore()
const dirty = ref(false)

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

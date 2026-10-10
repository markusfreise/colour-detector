<template>
  <section class="legend">
    <h2 class="legend__title">{{ analysis.imageName }} – colours and mixes</h2>
    <ol class="legend__list">
      <li v-for="(entry, i) in analysis.entries" :key="entry.id" class="legend__item">
        <span class="legend__number">{{ i + 1 }}</span>
        <RecipeLine v-if="entry.recipes[entry.chosen]" :recipe="entry.recipes[entry.chosen]" wide />
        <span class="legend__share">{{ Math.round(entry.share * 100) || '<1' }}%</span>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { useAnalysisStore } from '../stores/analysis.js'
import RecipeLine from './RecipeLine.vue'

const analysis = useAnalysisStore()
</script>

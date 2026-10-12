<template>
  <!-- The parts of the picture looked at so far, under the picture: one click goes back to each. -->
  <ul v-if="analysis.closeups.length" class="closeup closeup--strip" aria-label="Details of the picture">
    <li v-for="closeup in analysis.closeups" :key="closeup.id" class="closeup__item" :class="{ 'closeup__item--active': closeup.id === analysis.closeupId }">
      <button
        class="closeup__open"
        type="button"
        :aria-pressed="closeup.id === analysis.closeupId"
        :title="`Show detail ${closeup.number}`"
        @click="analysis.openCloseup(closeup.id)"
      >
        <img class="closeup__thumb" :src="closeup.thumb" :alt="`Detail ${closeup.number}`" />
        <span class="closeup__number">{{ closeup.number }}</span>
      </button>
      <button class="closeup__remove" type="button" :title="`Remove detail ${closeup.number}`" :aria-label="`Remove detail ${closeup.number}`" @click="analysis.removeCloseup(closeup.id)">
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </li>
  </ul>
</template>

<script setup>
import { useAnalysisStore } from '../stores/analysis.js'

const analysis = useAnalysisStore()
</script>

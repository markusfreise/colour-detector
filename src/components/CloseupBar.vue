<template>
  <!-- Above the picture while a part of it is on screen. -->
  <div v-if="closeup" class="closeup closeup--bar">
    <button class="button button--secondary" type="button" :disabled="analysis.busy" @click="analysis.showBase()">Return to base image</button>
    <span class="closeup__name">Detail {{ closeup.number }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'

const analysis = useAnalysisStore()
const closeup = computed(() => analysis.closeups.find((c) => c.id === analysis.closeupId) ?? null)
</script>

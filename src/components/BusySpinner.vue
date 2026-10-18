<template>
  <!-- While the picture is worked out: the nine hue swatches of Add colour as dots on a ring that turns. -->
  <div class="spinner" aria-hidden="true">
    <span
      v-for="(group, i) in HUE_GROUPS"
      :key="group.key"
      class="spinner__dot"
      :style="{ '--angle': `${(360 / HUE_GROUPS.length) * i}deg`, '--size': 1 - (0.45 * i) / (HUE_GROUPS.length - 1), background: group.hex }"
    ></span>
  </div>
</template>

<script setup>
import { HUE_GROUPS } from '../lib/color.js'
</script>

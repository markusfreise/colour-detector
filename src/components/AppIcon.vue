<template>
  <svg v-if="paths.length" class="icon" :viewBox="ICON_BOX" fill="currentColor" :role="label ? 'img' : null" :aria-label="label || null" :aria-hidden="label ? null : 'true'">
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { icons, ICON_BOX } from './icons.js'

const props = defineProps({
  // File name in resources/icons without ".svg", in lower case with hyphens.
  name: { type: String, required: true },
  // What the icon says, when it stands alone; without it the icon is decoration next to a text.
  label: { type: String, default: '' },
})

// A name without a file draws nothing, so a button can name its icon before the file is there.
const paths = computed(() => {
  if (import.meta.env.DEV && !icons[props.name]) console.warn(`AppIcon: no icon "${props.name}" in resources/icons`)
  return icons[props.name] ?? []
})
</script>

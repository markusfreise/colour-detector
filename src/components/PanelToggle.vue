<template>
  <button
    class="panel__toggle"
    :class="{ 'panel__toggle--collapsed': layout.collapsed[name] }"
    type="button"
    :aria-expanded="!layout.collapsed[name]"
    :title="layout.collapsed[name] ? `Show ${label}` : `Hide ${label}`"
    :aria-label="layout.collapsed[name] ? `Show ${label}` : `Hide ${label}`"
    @click="layout.toggle(name)"
  >
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m5 12.5 5-5 5 5" />
    </svg>
  </button>
</template>

<script setup>
import { useLayoutStore } from '../stores/layout.js'

defineProps({
  // The panel's key in the layout store, and what it is called in the button's title.
  name: { type: String, required: true },
  label: { type: String, required: true },
})
const layout = useLayoutStore()
</script>

<template>
  <button
    class="button"
    :class="{ 'sbutton--active': layout.collapsed[name] }"
    type="button"
    :aria-expanded="!layout.collapsed[name]"
    :data-hint="hint"
    :aria-label="t(layout.collapsed[name] ? 'Show {what}' : 'Hide {what}', { what: t(label) })"
    @click="layout.toggle(name)"
  >
    <AppIcon :name="icon" :label="t('Toggle panel')" />
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useLayoutStore } from '../stores/layout.js'
import AppIcon from './AppIcon.vue';
import { useText } from '../i18n/index.js'

const { t } = useText()
const props = defineProps({
  // The panel's key in the layout store, and what it is called in the button's labels.
  icon: { type: String, default: 'settings' },
  name: { type: String, required: true },
  label: { type: String, required: true },
})
const layout = useLayoutStore()
// The label shown on hover: "the settings" becomes "Settings".
const hint = computed(() => t(props.label.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase())))
</script>

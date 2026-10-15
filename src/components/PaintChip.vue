<template>
  <label
    class="chip paintbox__chip"
    :class="{ 'paintbox__chip--used': used, 'paintbox__chip--disabled': disabled }"
    :style="chipStyle(paint.hex)"
    :title="description"
  >
    <input class="paintbox__checkbox" type="checkbox" :checked="enabled" :disabled="disabled" @change="emit('toggle', $event.target.checked)" />
    <span v-if="showForm" class="paintbox__form">{{ paintForms(paint) }}</span>
    <span class="chip__strong">{{ paintNumber(paint.number) }}</span>
    <span class="chip__text paintbox__name">{{ paintName(paint) }}</span>
  </label>
</template>

<script setup>
import { computed } from 'vue'
import { chipStyle } from '../lib/color.js'
import { paintNumber, paintForms } from '../lib/paintbox.js'
import { useText } from '../i18n/index.js'

const { t, paintName } = useText()
const props = defineProps({
  paint: { type: Object, required: true },
  enabled: { type: Boolean, default: false },
  used: { type: Boolean, default: false },
  // Cannot be added right now (layer mode with all its layers taken).
  disabled: { type: Boolean, default: false },
  // Show P/T (pan/tube) in the corner – for lists that mix both forms.
  showForm: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle'])

// Tooltip: vendor line, German name, and the stock notes that do not fit on the chip.
const description = computed(() => {
  const p = props.paint
  // The other name of the paint: the English one when German is shown, and the other way round.
  const other = paintName(p) === p.name ? p.nameDe : p.name
  const parts = [`${p.vendor} ${p.line}`, other]
  if (p.source === 'estimate') parts.push(t('colour estimated'))
  if (p.note) parts.push(p.note)
  return parts.filter(Boolean).join(' · ')
})
</script>

<template>
  <label
    class="chip paintbox__chip"
    :class="{ 'paintbox__chip--used': used }"
    :style="chipStyle(paint.hex)"
    :title="description"
  >
    <input class="paintbox__checkbox" type="checkbox" :checked="enabled" @change="emit('toggle', $event.target.checked)" />
    <span class="chip__strong">{{ paintNumber(paint.number) }}</span>
    <span class="chip__text paintbox__name">{{ paint.name }}</span>
  </label>
</template>

<script setup>
import { computed } from 'vue'
import { chipStyle } from '../lib/color.js'
import { paintNumber } from '../lib/paintbox.js'

const props = defineProps({
  paint: { type: Object, required: true },
  enabled: { type: Boolean, default: false },
  used: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle'])

// Tooltip: vendor line, German name, and the stock notes that do not fit on the chip.
const description = computed(() => {
  const p = props.paint
  const parts = [`${p.vendor} ${p.line}`, p.nameDe]
  if (p.source === 'estimate') parts.push('colour estimated')
  if (p.note) parts.push(p.note)
  return parts.filter(Boolean).join(' · ')
})
</script>

<template>
  <!-- A paint of one's own, new or edited: series, number, form, name and colour. -->
  <form class="paintbox__paint-form" @submit.prevent="emit('submit')">
    <label class="paintbox__input paintbox__input--wide">
      <span>{{ t('Vendor and Series') }}</span>
      <select v-model="seriesPick" class="input input--select">
        <option v-for="name in series" :key="name" :value="name">{{ name }}</option>
        <option value="new">{{ t('New series') }}</option>
      </select>
    </label>
    <label v-if="seriesPick === 'new'" class="paintbox__input paintbox__input--wide">
      <span>{{ t('Name of the series') }}</span>
      <input v-model="paint.vendor" class="input" type="text" maxlength="60" required @change="lookUp" />
      <span class="paintbox__hint">{{ t('New series will be created') }}</span>
    </label>
    <label class="paintbox__input">
      <span>{{ t('Number') }}</span>
      <input v-model="paint.number" class="input" type="text" maxlength="12" required @change="lookUp" />
    </label>
    <label class="paintbox__input">
      <span>{{ t('Form') }}</span>
      <select v-model="paint.form" class="input input--select">
        <option value="pan">{{ t('Pan') }}</option>
        <option value="tube">{{ t('Tube') }}</option>
      </select>
    </label>
    <label class="paintbox__input paintbox__input--wide">
      <span>{{ t('Name') }}</span>
      <input v-model="paint.name" class="input" type="text" maxlength="60" required />
    </label>
    <label class="paintbox__input paintbox__input--wide">
      <span>{{ t('Colour') }}</span>
      <input v-model="paint.hex" class="input input--colour" type="color" />
    </label>
    <p class="paintbox__note">
      {{ t('Pick the colour of the paint at its strongest wash: about equal parts paint and water, dry on white paper. Not the colour straight from the pan or tube.') }}
      <template v-if="library && pro">{{ t('{library} numbers fill in name and colour.', { library: library.name }) }}</template>
    </p>
    <p v-if="found" class="paintbox__note">
      {{ [`${library.name} ${found.number}`, ...chartDetails(found, t)].join(' · ') }}.
      <template v-if="!found.hex">{{ t('The chart gives no reliable colour for this paint: set it by hand.') }}</template>
    </p>
    <div class="paintbox__form-actions">
      <button class="button button--secondary" type="submit">{{ paint.id ? t('Save paint') : t('Add paint') }}</button>
      <button class="button button--ghost" type="button" @click="emit('cancel')">{{ t('Cancel') }}</button>
    </div>
  </form>
</template>

<script setup>
import { computed } from 'vue'
import { chartColour, chartDetails } from '../data/libraries.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const props = defineProps({
  series: { type: Array, required: true },
  // The library of the series entered, or null: its numbers fill in name and colour.
  library: { type: Object, default: null },
  pro: { type: Boolean, default: false },
})
const emit = defineEmits(['submit', 'cancel'])
// { id, vendor, number, name, form, hex }, changed in place.
const paint = defineModel({ type: Object, required: true })

// The series as a dropdown; "new" opens a field for a series of one's own.
const seriesPick = computed({
  get: () => (props.series.includes(paint.value.vendor) ? paint.value.vendor : 'new'),
  set: (name) => {
    paint.value.vendor = name === 'new' ? '' : name
  },
})

// The colour of the chart the number entered stands for, with Pro.
const found = computed(() => (props.pro ? chartColour(props.library, paint.value.number) : null))

// A number that is on the colour chart of its library fills in the rest: the name, and the colour
// where the chart gives one.
function lookUp() {
  const form = paint.value
  if (form.id || form.name || !found.value) return
  form.name = found.value.name
  if (found.value.hex) form.hex = found.value.hex
}
</script>

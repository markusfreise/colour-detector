<template>
  <!-- A paint of one's own, new or edited: colour, number, series and name in one row, its form below. -->
  <form class="paint-form" @submit.prevent="emit('submit')">
    <div class="paint-form__fields">
      <input v-model="paint.hex" class="paint-form__swatch" type="color" :aria-label="t('Colour')" :title="t('Colour')" />
      <input
        v-model="paint.number"
        class="input paint-form__number"
        type="text"
        maxlength="12"
        required
        :placeholder="t('Number')"
        :aria-label="t('Number')"
        @change="lookUp"
      />
      <input
        v-model="paint.vendor"
        class="input paint-form__series"
        type="text"
        maxlength="60"
        required
        :list="seriesListId"
        :placeholder="t('Series')"
        :aria-label="t('Series')"
        @change="lookUp"
      />
      <datalist :id="seriesListId">
        <option v-for="name in series" :key="name" :value="name"></option>
      </datalist>
      <input v-model="paint.name" class="input paint-form__name" type="text" maxlength="60" required :placeholder="t('Name')" :aria-label="t('Name')" />
    </div>

    <div class="paint-form__row">
      <div class="paint-form__forms" role="group" :aria-label="t('Form')">
        <button
          v-for="form in OWN_FORMS"
          :key="form.key"
          class="button"
          :class="{ 'button--active': paint.form === form.key }"
          type="button"
          :aria-pressed="paint.form === form.key"
          @click="paint.form = form.key"
        >
          {{ t(form.name) }}
        </button>
      </div>
      <div class="paint-form__actions">
        <button v-if="paint.id" class="button button--ghost" type="button" @click="emit('cancel')">{{ t('Cancel') }}</button>
        <button class="button paint-form__submit" type="submit">{{ t('Okay') }}</button>
      </div>
    </div>

    <p v-if="!paint.id" class="paint-form__note">
      {{ t('Pick the colour of the paint at its strongest wash: about equal parts paint and water, dry on white paper. Not the colour straight from the pan or tube.') }}
      <template v-if="library && pro">{{ t('{library} numbers fill in name and colour.', { library: t(library.name) }) }}</template>
    </p>
    <p v-if="found" class="paint-form__note">
      {{ [`${t(library.name)} ${found.number}`, ...chartDetails(found, t)].join(' · ') }}.
      <template v-if="!found.hex">{{ t('The chart gives no reliable colour for this paint: set it by hand.') }}</template>
    </p>
  </form>
</template>

<script setup>
import { computed } from 'vue'
import { chartColour, chartDetails } from '../data/libraries.js'
import { OWN_FORMS } from '../lib/paintbox.js'
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

const seriesListId = `paint-form-series-${Math.random().toString(36).slice(2, 8)}`

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

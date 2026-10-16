<template>
  <!-- A field with the matching colours below it: type a part of the series, number or name. -->
  <div class="colour-search" @focusout="onFocusOut">
    <input
      ref="field"
      v-model="query"
      class="input colour-search__input"
      type="text"
      role="combobox"
      autocomplete="off"
      :aria-label="label"
      :placeholder="placeholder"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open && found[active] ? `${listId}-${active}` : undefined"
      @focus="open = true"
      @input="onInput"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="pick(found[active])"
      @keydown.esc.stop.prevent="open = false"
    />
    <ul v-if="open && query.trim()" :id="listId" class="colour-search__list" role="listbox">
      <li
        v-for="(option, index) in found"
        :id="`${listId}-${index}`"
        :key="option.key"
        class="colour-search__option"
        :class="{ 'colour-search__option--active': index === active }"
        role="option"
        :aria-selected="index === active"
        @mousedown.prevent="pick(option)"
        @mousemove="active = index"
      >
        <span class="colour-search__swatch" :style="{ background: option.hex }" aria-hidden="true"></span>
        <span class="colour-search__label">{{ option.label }}</span>
        <span v-if="option.note" class="colour-search__note">{{ option.note }}</span>
      </li>
      <li v-if="!found.length" class="colour-search__none">{{ t('No colour found') }}</li>
    </ul>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { searchColours } from '../lib/paintbox.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const props = defineProps({
  // [{ key, label, hex, note?, search? }]
  options: { type: Array, required: true },
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
})
const emit = defineEmits(['pick'])

const listId = `colour-search-${Math.random().toString(36).slice(2, 8)}`
const field = ref(null)
const query = ref('')
const open = ref(false)
const active = ref(0)
const found = computed(() => (query.value.trim() ? searchColours(props.options, query.value) : []))

defineExpose({ focus: () => field.value?.focus() })

function onInput() {
  open.value = true
  active.value = 0
}

function move(step) {
  if (!found.value.length) return
  open.value = true
  active.value = (active.value + step + found.value.length) % found.value.length
}

// The field is emptied for the next colour and keeps the focus.
function pick(option) {
  if (!option) return
  emit('pick', option)
  query.value = ''
  active.value = 0
}

function onFocusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) open.value = false
}
</script>

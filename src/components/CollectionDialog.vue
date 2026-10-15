<template>
  <dialog ref="dialog" class="panel collection" aria-labelledby="collection-title" @click="onBackdrop">
    <div class="collection__body">
      <header class="collection__header">
        <h2 id="collection-title" class="panel__title">{{ t('Collection') }}</h2>
        <div class="collection__actions">
          <button class="button button--secondary" type="button" :disabled="!analysis.image" @click="save">
            {{ analysis.savedId ? t('Save changes') : t('Save this picture') }}
          </button>
          <button class="button button--ghost" type="button" @click="dialog.close()">{{ t('Close') }}</button>
        </div>
      </header>
      <p v-if="collection.error" class="collection__error">{{ collection.error }}</p>
      <ul v-if="collection.items.length" class="collection__list">
        <li
          v-for="item in collection.items"
          :key="item.id"
          class="collection__item"
          :class="{ 'collection__item--active': item.id === analysis.savedId }"
        >
          <button class="collection__open" type="button" :title="t('Open {name}', { name: item.name })" @click="open(item.id)">
            <img class="collection__thumb" :src="item.thumb" :alt="item.name" />
          </button>
          <form v-if="renaming === item.id" class="collection__rename" @submit.prevent="rename(item.id)">
            <input v-model="newName" class="input" type="text" maxlength="60" :aria-label="t('Name of the picture')" />
            <button class="button" type="submit">{{ t('Save') }}</button>
          </form>
          <template v-else>
            <span class="collection__name" :title="item.name">{{ item.name }}</span>
            <span class="collection__item-actions">
              <button class="button button--ghost" type="button" @click="startRename(item)">{{ t('Rename') }}</button>
              <button class="button button--ghost" type="button" @click="remove(item.id)">
                {{ confirming === item.id ? t('Really delete?') : t('Delete') }}
              </button>
            </span>
          </template>
        </li>
      </ul>
      <p v-else class="collection__empty">
        {{ t('No pictures saved yet. "Save this picture" keeps the photo with its settings and colour changes on this device.') }}
      </p>
    </div>
  </dialog>
</template>

<script setup>
import { ref } from 'vue'
import { useCollectionStore } from '../stores/collection.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { useProStore } from '../stores/pro.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const collection = useCollectionStore()
const analysis = useAnalysisStore()
const pro = useProStore()
const dialog = ref(null)
const renaming = ref(null)
const newName = ref('')
const confirming = ref(null) // id whose delete button was clicked once

defineExpose({
  open: () => {
    confirming.value = null
    renaming.value = null
    collection.refresh()
    dialog.value.showModal()
  },
})

function onBackdrop(event) {
  if (event.target === dialog.value) dialog.value.close()
}

async function save() {
  await collection.saveCurrent()
  // The purchase dialog is a modal of its own; this one would cover it.
  if (pro.offered) dialog.value.close()
}

async function open(id) {
  dialog.value.close()
  await collection.open(id)
}

function startRename(item) {
  renaming.value = item.id
  newName.value = item.name
}

async function rename(id) {
  await collection.rename(id, newName.value)
  renaming.value = null
}

async function remove(id) {
  if (confirming.value !== id) {
    confirming.value = id
    return
  }
  confirming.value = null
  await collection.remove(id)
}
</script>

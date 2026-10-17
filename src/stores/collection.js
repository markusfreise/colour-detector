import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { listImages, getImage, putImage, deleteImage, getLast, putLast } from '../lib/collectionDb.js'
import { usePaintsStore } from './paints.js'
import { useAnalysisStore } from './analysis.js'
import { useProStore, FREE_IMAGES } from './pro.js'
import { useAccountStore } from './account.js'
import { t } from '../i18n/index.js'

const STORE_SIZE = 1600 // longest side of the stored picture
const THUMB_SIZE = 320

function scaled(image, size, type, quality) {
  const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  if (type === 'dataUrl') return canvas.toDataURL('image/jpeg', quality)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// The image of the picture used last, as it was stored: it is encoded once per picture.
let lastImage = null
let lastBlob = null

export const useCollectionStore = defineStore('collection', {
  state: () => ({
    items: [], // [{ id, name, thumb, updatedAt }] newest first
    error: null,
  }),
  actions: {
    async refresh() {
      try {
        const records = await listImages()
        this.items = records
          .map(({ id, name, thumb, updatedAt, picture }) => ({ id, name, thumb, updatedAt, hash: picture?.hash ?? null }))
          .sort((a, b) => b.updatedAt - a.updatedAt)
        // Which of them were unlocked with a credit (the badge in the collection).
        useAccountStore().learnKeys(this.items.map((item) => item.hash))
      } catch (e) {
        this.error = t('Could not read the collection: {reason}', { reason: t(e.message) })
      }
    },

    /** Save the current picture with its settings and colour changes; updates it when it is already saved. */
    async saveCurrent() {
      const analysis = useAnalysisStore()
      if (!analysis.image) return false
      const isNew = !analysis.savedId
      if (isNew && !useProStore().require('save', FREE_IMAGES ? 'save more than one picture' : 'save pictures', this.items.length < FREE_IMAGES)) return false
      this.error = null
      try {
        const id = analysis.savedId ?? `img-${Date.now().toString(36)}`
        const existing = isNew ? null : await getImage(id)
        await putImage({
          id,
          name: analysis.imageName,
          blob: existing?.blob ?? (await scaled(analysis.image, STORE_SIZE, 'blob', 0.9)),
          thumb: existing?.thumb ?? scaled(analysis.image, THUMB_SIZE, 'dataUrl', 0.8),
          settings: { ...analysis.settings },
          edits: analysis.exportEdits(),
          palette: structuredClone(toRaw(usePaintsStore().palette)),
          picture: existing?.picture ?? { ...analysis.picture },
          updatedAt: Date.now(),
        })
        analysis.savedId = id
        await this.refresh()
        return true
      } catch (e) {
        this.error = t('Could not save the picture: {reason}', { reason: t(e.message) })
        return false
      }
    },

    /**
     * Keeps the picture on screen as the one used last, with its settings and colour changes, so
     * that it opens again after the next sign-in or start. Not the showcase behind signing in, and
     * not a close-up (its base picture is the one that counts).
     */
    async rememberCurrent() {
      const analysis = useAnalysisStore()
      if (!analysis.image || analysis.closeupId != null || usePaintsStore().showcase) return
      try {
        if (analysis.image !== lastImage) {
          lastBlob = await scaled(analysis.image, STORE_SIZE, 'blob', 0.9)
          lastImage = analysis.image
        }
        await putLast({
          name: analysis.imageName,
          blob: lastBlob,
          settings: { ...analysis.settings },
          edits: analysis.exportEdits(),
          palette: structuredClone(toRaw(usePaintsStore().palette)),
          picture: { ...analysis.picture },
          savedId: analysis.savedId ?? null,
          updatedAt: Date.now(),
        })
      } catch {
        // Not kept: the next start opens without it.
      }
    },

    /** Opens the picture used last; false when there is none. */
    async openLast() {
      try {
        const record = await getLast()
        if (!record?.blob) return false
        await useAnalysisStore().loadSaved({ ...record, id: record.savedId ?? null })
        lastImage = useAnalysisStore().image
        lastBlob = record.blob
        return true
      } catch {
        return false
      }
    },

    async open(id) {
      this.error = null
      try {
        const record = await getImage(id)
        if (!record) throw new Error('picture not found')
        await useAnalysisStore().loadSaved(record)
      } catch (e) {
        this.error = t('Could not open the picture: {reason}', { reason: t(e.message) })
      }
    },

    async rename(id, name) {
      const record = await getImage(id)
      if (!record || !name.trim()) return
      record.name = name.trim()
      await putImage(record)
      const analysis = useAnalysisStore()
      if (analysis.savedId === id) analysis.imageName = record.name
      await this.refresh()
    },

    async remove(id) {
      await deleteImage(id)
      const analysis = useAnalysisStore()
      if (analysis.savedId === id) analysis.savedId = null
      await this.refresh()
    },
  },
})

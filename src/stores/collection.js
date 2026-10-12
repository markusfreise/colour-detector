import { defineStore } from 'pinia'
import { listImages, getImage, putImage, deleteImage } from '../lib/collectionDb.js'
import { useAnalysisStore } from './analysis.js'
import { useProStore, FREE_IMAGES } from './pro.js'

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
          .map(({ id, name, thumb, updatedAt }) => ({ id, name, thumb, updatedAt }))
          .sort((a, b) => b.updatedAt - a.updatedAt)
      } catch (e) {
        this.error = `Could not read the collection: ${e.message}`
      }
    },

    /** Save the current picture with its settings and colour changes; updates it when it is already saved. */
    async saveCurrent() {
      const analysis = useAnalysisStore()
      if (!analysis.image) return false
      const isNew = !analysis.savedId
      if (isNew && !useProStore().require(this.items.length < FREE_IMAGES, FREE_IMAGES ? 'save more than one picture' : 'save pictures')) return false
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
          updatedAt: Date.now(),
        })
        analysis.savedId = id
        await this.refresh()
        return true
      } catch (e) {
        this.error = `Could not save the picture: ${e.message}`
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
        this.error = `Could not open the picture: ${e.message}`
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

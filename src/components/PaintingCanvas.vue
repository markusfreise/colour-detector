<template>
  <div class="painting">
    <canvas
      ref="canvas"
      class="painting__canvas"
      :class="{ 'painting__canvas--busy': analysis.busy }"
      @click="onClick"
    ></canvas>
    <p v-if="analysis.busy" class="painting__status">Analysing…</p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { hexToRgb, contrastText } from '../lib/color.js'

const SCALE = 2 // canvas pixels per working pixel – keeps outlines and numbers crisp
const MIN_LABEL_DIST = 5 // only number areas with enough room for a label

const analysis = useAnalysisStore()
const canvas = ref(null)

function draw() {
  const seg = analysis.segmentation
  const el = canvas.value
  if (!seg || !el) return
  const { width, height, regionMap, regions } = seg
  el.width = width * SCALE
  el.height = height * SCALE
  const ctx = el.getContext('2d')
  const { view, outlines, numbers } = analysis.settings

  if (view === 'original') {
    ctx.drawImage(analysis.image, 0, 0, el.width, el.height)
  } else {
    const colours = analysis.entries.map((e) => hexToRgb(analysis.displayHex(e)))
    const sel = analysis.selectedEntry
    const img = new ImageData(width, height)
    for (let p = 0; p < regionMap.length; p++) {
      const entry = analysis.regionEntry[regionMap[p]]
      let [r, g, b] = colours[entry]
      if (sel != null && entry !== sel) {
        r = r * 0.35 + 255 * 0.65
        g = g * 0.35 + 255 * 0.65
        b = b * 0.35 + 255 * 0.65
      }
      img.data[p * 4] = r
      img.data[p * 4 + 1] = g
      img.data[p * 4 + 2] = b
      img.data[p * 4 + 3] = 255
    }
    const off = document.createElement('canvas')
    off.width = width
    off.height = height
    off.getContext('2d').putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, el.width, el.height)
  }

  if (outlines) {
    ctx.fillStyle = view === 'original' ? 'rgba(255,255,255,0.75)' : 'rgba(40,36,30,0.55)'
    const entryAt = (p) => analysis.regionEntry[regionMap[p]]
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        const e = entryAt(p)
        if (x < width - 1 && entryAt(p + 1) !== e) ctx.fillRect((x + 1) * SCALE - 0.5, y * SCALE, 1, SCALE)
        if (y < height - 1 && entryAt(p + width) !== e) ctx.fillRect(x * SCALE, (y + 1) * SCALE - 0.5, SCALE, 1)
      }
    }
  }

  if (numbers) {
    ctx.font = `600 ${11 * (SCALE / 2)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const region of regions) {
      if (region.anchorDist < MIN_LABEL_DIST) continue
      const entryIndex = analysis.regionEntry[region.id]
      const entry = analysis.entries[entryIndex]
      ctx.fillStyle = view === 'original' ? '#ffffff' : contrastText(analysis.displayHex(entry))
      ctx.fillText(String(entryIndex + 1), (region.anchorX + 0.5) * SCALE, (region.anchorY + 0.5) * SCALE)
    }
  }
}

function onClick(event) {
  const seg = analysis.segmentation
  if (!seg) return
  const rect = canvas.value.getBoundingClientRect()
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * seg.width)
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * seg.height)
  if (x < 0 || y < 0 || x >= seg.width || y >= seg.height) return
  const region = seg.regionMap[y * seg.width + x]
  if (analysis.selectedRegion === region) analysis.select(null)
  else analysis.select(region)
}

watch(
  () => [
    analysis.renderVersion,
    analysis.selectedEntry,
    analysis.settings.view,
    analysis.settings.outlines,
    analysis.settings.numbers,
  ],
  draw,
)
onMounted(draw)
</script>

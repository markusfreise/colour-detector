<template>
  <div class="painting">
    <canvas
      ref="canvas"
      class="painting__canvas"
      :class="{ 'painting__canvas--busy': analysis.busy }"
      @click="onClick"
    ></canvas>
    <p v-if="analysis.busy" class="painting__status">{{ analysis.layerMode ? 'Planning layers…' : 'Analysing…' }}</p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { hexToRgb, contrastText } from '../lib/color.js'
import { drawLayerView, drawOutlines, labelFont, paintPixels } from './layerView.js'

const SCALE = 2 // canvas pixels per working pixel – keeps outlines and numbers crisp
const MIN_LABEL_DIST = 5 // only number areas with enough room for a label

const analysis = useAnalysisStore()
const canvas = ref(null)

// Whether an entry is drawn: everything, or only the mix of the selected colour.
function shown(entryIndex) {
  const selected = analysis.selected
  return !selected || analysis.entries[entryIndex].family === selected.family
}

// The photo as the analysis sees it: with saturation and contrast applied when they are changed.
function drawPhoto(ctx, el, width, height) {
  if (analysis.adjusted) paintPixels(ctx, el, analysis.adjusted.rgba, width, height, true)
  else ctx.drawImage(analysis.image, 0, 0, el.width, el.height)
}

function draw() {
  const el = canvas.value
  if (!el) return
  if (analysis.layerMode) drawLayers(el)
  else drawMixes(el)
}

// Mix mode: flat numbered areas, one colour per wash of a mix.
function drawMixes(el) {
  const seg = analysis.segmentation
  if (!seg || !analysis.regionEntry) return
  const { width, height, regionMap, regions } = seg
  el.width = width * SCALE
  el.height = height * SCALE
  const ctx = el.getContext('2d')
  const { view, outlines, numbers } = analysis.settings

  if (view === 'original') {
    drawPhoto(ctx, el, width, height)
  } else {
    const colours = analysis.entries.map((e) => hexToRgb(analysis.displayHex(e)))
    const img = new Uint8ClampedArray(width * height * 4)
    for (let p = 0; p < regionMap.length; p++) {
      const entry = analysis.regionEntry[regionMap[p]]
      // With a colour selected, only its mix stays: all its washes, the rest of the picture goes blank.
      const [r, g, b] = shown(entry) ? colours[entry] : [255, 255, 255]
      img[p * 4] = r
      img[p * 4 + 1] = g
      img[p * 4 + 2] = b
      img[p * 4 + 3] = 255
    }
    paintPixels(ctx, el, img, width, height)
  }

  if (outlines) {
    const entryAt = (p) => analysis.regionEntry[regionMap[p]]
    drawOutlines(ctx, width, height, SCALE, (p, q) => entryAt(p) !== entryAt(q), view === 'original' ? 'rgba(255,255,255,0.75)' : 'rgba(40,36,30,0.55)')
  }

  if (numbers) {
    labelFont(ctx, SCALE)
    for (const region of regions) {
      if (region.anchorDist < MIN_LABEL_DIST) continue
      const entryIndex = analysis.regionEntry[region.id]
      if (view !== 'original' && !shown(entryIndex)) continue
      const entry = analysis.entries[entryIndex]
      ctx.fillStyle = view === 'original' ? '#ffffff' : contrastText(analysis.displayHex(entry))
      ctx.fillText(entry.label, (region.anchorX + 0.5) * SCALE, (region.anchorY + 0.5) * SCALE)
    }
  }
}

// Layer mode: the paper with the ticked layers on it. One layer alone shows its coats as numbers;
// a step of the painting order outlines what is painted in that step.
function drawLayers(el) {
  const result = analysis.layers
  if (!result) {
    // No base paints: blank paper in the shape of the picture.
    if (analysis.pixels) {
      el.width = analysis.pixels.width * SCALE
      el.height = analysis.pixels.height * SCALE
      const ctx = el.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, el.width, el.height)
    }
    return
  }
  const { view, outlines, numbers } = analysis.settings
  const ctx = drawLayerView(el, result, {
    show: analysis.layerView,
    step: analysis.layerStep == null ? null : result.steps[analysis.layerStep],
    outlines,
    numbers,
    scale: SCALE,
    backdrop: view === 'original' ? (context, canvasEl) => drawPhoto(context, canvasEl, result.width, result.height) : null,
  })

  const point = analysis.layerPoint
  if (point) {
    // The spot whose layers are listed next to the picture.
    const x = (point.x + 0.5) * SCALE, y = (point.y + 0.5) * SCALE
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#1d1b18'
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke()
  }
}

function onClick(event) {
  const size = analysis.layerMode ? analysis.layers : analysis.segmentation
  if (!size) return
  const rect = canvas.value.getBoundingClientRect()
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * size.width)
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * size.height)
  if (x < 0 || y < 0 || x >= size.width || y >= size.height) return
  if (analysis.layerMode) {
    analysis.selectPoint({ x, y })
    return
  }
  const region = size.regionMap[y * size.width + x]
  // A click on the blanked part of the picture brings everything back.
  if (analysis.selectedRegion === region || !shown(analysis.regionEntry[region])) analysis.select(null)
  else analysis.select(region)
}

watch(
  () => [
    analysis.renderVersion,
    analysis.selectedEntry,
    analysis.settings.mode,
    analysis.settings.view,
    analysis.settings.outlines,
    analysis.settings.numbers,
  ],
  draw,
)
onMounted(draw)
</script>

<template>
  <div class="painting" :class="{ 'painting--fit': fit }">
    <button
      class="painting__zoom"
      type="button"
      :aria-pressed="!fit"
      :title="fit ? 'Show the picture in full size' : 'Fit the picture to the window'"
      :aria-label="fit ? 'Show the picture in full size' : 'Fit the picture to the window'"
      @click="fit = !fit"
    >
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M12.7 12.7 17 17M6.2 8.5h4.6" />
        <path v-if="fit" d="M8.5 6.2v4.6" />
      </svg>
    </button>
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
// The picture fits the height of the window unless the magnifier asks for its full size.
const fit = ref(true)

// Whether an entry is drawn: everything, or only the mix of the selected colour.
function shown(entryIndex) {
  const selected = analysis.selected
  return !selected || analysis.entries[entryIndex].family === selected.family
}

// The photo as the analysis sees it: with saturation and contrast applied when they are changed.
function drawPhoto(ctx, el) {
  // The photo's own size: while a new picture is analysed, the areas on screen are still those of the one before.
  if (analysis.adjusted) paintPixels(ctx, el, analysis.adjusted.rgba, analysis.adjusted.width, analysis.adjusted.height, true)
  else ctx.drawImage(analysis.image, 0, 0, el.width, el.height)
}

function draw() {
  const el = canvas.value
  if (!el) return
  if (analysis.settings.view === 'sketch') return drawSketch(el)
  if (analysis.layerMode) drawLayers(el)
  else drawMixes(el)
  drawDetails(el)
}

// The final wash of fine dark details from the AI's plan, over the mixes or the layers.
function drawDetails(el) {
  const details = analysis.aiActive && analysis.settings.details ? analysis.aiDetails : null
  if (!details || details.key !== analysis.aiKey || analysis.settings.view === 'original') return
  if (details.width * SCALE !== el.width || details.height * SCALE !== el.height) return
  const [r, g, b] = hexToRgb(details.hex)
  const rgba = new Uint8ClampedArray(details.mask.length * 4)
  for (let p = 0; p < details.mask.length; p++) {
    if (!details.mask[p]) continue
    rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = 255
  }
  paintPixels(el.getContext('2d'), el, rgba, details.width, details.height)
}

// The pencil sketch to start from: the edges of the photo, firm inside the main subjects the AI
// named, and the fine dark details.
function drawSketch(el) {
  const source = analysis.pixels
  if (!source) return
  el.width = source.width * SCALE
  el.height = source.height * SCALE
  const ctx = el.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, el.width, el.height)
  const sketch = analysis.sketch?.key === analysis.sketchKey ? analysis.sketch : null
  if (!sketch) {
    analysis.ensureSketch()
    return
  }
  const { width, height, lines } = sketch
  const details = analysis.aiDetails?.key === analysis.aiKey && analysis.aiDetails.width === width ? analysis.aiDetails.mask : null
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let p = 0; p < lines.length; p++) {
    const ink = details?.[p] ? 235 : lines[p] === 2 ? 215 : lines[p] === 1 ? 95 : 0
    if (!ink) continue
    rgba[p * 4] = 60; rgba[p * 4 + 1] = 58; rgba[p * 4 + 2] = 56; rgba[p * 4 + 3] = ink
  }
  paintPixels(ctx, el, rgba, width, height, true)
  if (analysis.settings.guides) drawGuides(ctx, el.width, el.height)
}

// Guide lines for transferring the sketch to paper: the picture in quarters each way, its two
// diagonals and the diamond between the middles of its sides.
function drawGuides(ctx, w, h) {
  ctx.save()
  ctx.strokeStyle = 'rgba(90, 190, 240, 0.75)'
  ctx.lineWidth = Math.max(2, Math.round(w / 500))
  ctx.beginPath()
  const line = (x0, y0, x1, y1) => { ctx.moveTo(x0 * w, y0 * h); ctx.lineTo(x1 * w, y1 * h) }
  for (const t of [0.25, 0.5, 0.75]) { line(t, 0, t, 1); line(0, t, 1, t) }
  line(0, 0, 1, 1); line(1, 0, 0, 1)
  line(0.5, 0, 0, 0.5); line(0.5, 0, 1, 0.5); line(0, 0.5, 0.5, 1); line(1, 0.5, 0.5, 1)
  ctx.stroke()
  ctx.restore()
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
    drawPhoto(ctx, el)
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
    stepView: analysis.layerStepView,
    outlines,
    numbers,
    scale: SCALE,
    backdrop: view === 'original' ? drawPhoto : null,
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
  if (analysis.settings.view === 'sketch') return // nothing to pick in the sketch
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
    analysis.layerStepView,
    analysis.settings.mode,
    analysis.settings.view,
    analysis.settings.details,
    analysis.settings.guides,
    analysis.aiDetails,
    analysis.sketchKey,
    analysis.settings.outlines,
    analysis.settings.numbers,
  ],
  draw,
)
onMounted(draw)
</script>

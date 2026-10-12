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
    <!-- A frame drawn on the base picture becomes a close-up: that part, analysed on its own. -->
    <button
      v-if="analysis.image && analysis.closeupId == null"
      class="painting__zoom painting__zoom--frame"
      :class="{ 'painting__zoom--on': framing }"
      type="button"
      :aria-pressed="framing"
      :title="framing ? 'Drag a frame over the part to zoom in on. Click here to cancel.' : 'Zoom in on a part of the picture'"
      :aria-label="framing ? 'Cancel choosing a part of the picture' : 'Zoom in on a part of the picture'"
      @click="framing = !framing"
    >
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
        <path d="M10 7.5v5M7.5 10h5" />
      </svg>
    </button>
    <canvas
      ref="canvas"
      class="painting__canvas"
      :class="{ 'painting__canvas--busy': analysis.busy, 'painting__canvas--framing': framing }"
      @click="onClick"
      @mousemove="onMove"
      @mouseleave="hover = null"
      @pointerdown="startFrame"
      @pointermove="moveFrame"
      @pointerup="endFrame"
      @pointercancel="frame = null"
    ></canvas>
    <div v-if="frame" class="painting__frame" :style="frameStyle"></div>
    <p v-if="framing && !frame" class="painting__status">Drag a frame over the part to zoom in on</p>
    <RecipeTip v-if="hover" :index="hover.entry" :x="hover.x" :y="hover.y" />
    <p v-if="analysis.busy" class="painting__status">{{ analysis.layerMode ? 'Planning layers…' : 'Analysing…' }}</p>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { hexToRgb, contrastText } from '../lib/color.js'
import { drawLayerView, labelFont, paintPixels } from './layerView.js'
import { smoothCurve } from '../lib/sketch.js'
import { upscaleAreas } from '../lib/smooth.js'
import RecipeTip from './RecipeTip.vue'
import { closeupRect } from '../lib/closeup.js'

const SCALE = 2 // canvas pixels per working pixel – keeps outlines and numbers crisp
const MIN_LABEL_DIST = 5 // only number areas with enough room for a label
const BLANK = [255, 255, 255] // paper

const analysis = useAnalysisStore()
const canvas = ref(null)
// The picture fits the height of the window unless the magnifier asks for its full size.
const fit = ref(true)
// The colour under the pointer and where the pointer is, for its recipe next to it.
const hover = ref(null)

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

// The pencil sketch to start from, like a colouring book: the shapes of the photo with smooth
// outlines, firm inside the main subjects the AI named, and the fine dark details.
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
  // Every border as one smooth curve; firm lines for the main subjects, lighter ones elsewhere.
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const firm of [false, true]) {
    ctx.beginPath()
    for (const path of sketch.paths) {
      if (path.firm !== firm) continue
      ctx.moveTo(path.points[0] * SCALE, path.points[1] * SCALE)
      for (const [ax, ay, bx, by, x, y] of smoothCurve(path.points, path.closed)) {
        ctx.bezierCurveTo(ax * SCALE, ay * SCALE, bx * SCALE, by * SCALE, x * SCALE, y * SCALE)
      }
      if (path.closed) ctx.closePath()
    }
    ctx.strokeStyle = firm ? '#3c3a38' : 'rgba(60, 58, 56, 0.45)'
    ctx.lineWidth = (firm ? 1.6 : 1.1) * SCALE
    ctx.stroke()
  }
  // The fine dark details of an AI plan, filled in.
  const details = analysis.aiDetails?.key === analysis.aiKey && analysis.aiDetails.width === sketch.width ? analysis.aiDetails : null
  if (details) {
    const rgba = new Uint8ClampedArray(details.mask.length * 4)
    for (let p = 0; p < details.mask.length; p++) {
      if (!details.mask[p]) continue
      rgba[p * 4] = 60; rgba[p * 4 + 1] = 58; rgba[p * 4 + 2] = 56; rgba[p * 4 + 3] = 235
    }
    paintPixels(ctx, el, rgba, details.width, details.height, true)
  }
  if (analysis.settings.guides) drawGuides(ctx, el.width, el.height)
}

// Guide lines for transferring the sketch to paper: the picture in quarters each way, its two
// diagonals and the diamond between the middles of its sides.
function drawGuides(ctx, w, h) {
  ctx.save()
  ctx.strokeStyle = 'rgba(90, 190, 240, 0.5)'
  ctx.lineWidth = Math.max(2, Math.round(w / 500))
  ctx.beginPath()
  const line = (x0, y0, x1, y1) => { ctx.moveTo(x0 * w, y0 * h); ctx.lineTo(x1 * w, y1 * h) }
  for (const t of [0.25, 0.5, 0.75]) { line(t, 0, t, 1); line(0, t, 1, t) }
  line(0, 0, 1, 1); line(1, 0, 0, 1)
  line(0.5, 0, 0, 0.5); line(0.5, 0, 1, 0.5); line(0, 0.5, 0.5, 1); line(1, 0.5, 0.5, 1)
  ctx.stroke()
  ctx.restore()
}

// The areas of mix mode at the size of the canvas: the palette entry of every canvas pixel, with
// the outlines of the areas as smooth lines instead of enlarged pixel steps. Colours, outlines
// and clicks all read this one map, so they agree. It is kept until the areas change: a new
// segmentation, a new list of entries per region, or one region moved to another entry (which
// changes that list in place, hence the sum over it). A new colour or recipe for an entry, a
// selection or a setting of the view draws from the kept map.
let canvasAreas = null
function areasAtCanvasSize() {
  const seg = analysis.segmentation
  const regionEntry = analysis.regionEntry
  if (!seg || !regionEntry) return null
  let sum = 0
  for (let r = 0; r < regionEntry.length; r++) sum = (Math.imul(sum, 31) + regionEntry[r]) | 0
  const kept = canvasAreas
  if (kept && kept.seg === seg && kept.regionEntry === regionEntry && kept.sum === sum) return kept.entryOf
  const { width, height, regionMap } = seg
  const entries = new Int32Array(regionMap.length)
  for (let p = 0; p < entries.length; p++) entries[p] = regionEntry[regionMap[p]]
  const entryOf = upscaleAreas(entries, width, height, SCALE)
  canvasAreas = { seg, regionEntry, sum, entryOf }
  return entryOf
}

// The area under a canvas pixel: the one drawn there. Where a smooth outline has moved over the
// pixel, that is the area on the other side of the outline, next to the working pixel below it.
function regionAtCanvasPixel(cx, cy) {
  const seg = analysis.segmentation
  const entryOf = areasAtCanvasSize()
  const { width, height, regionMap } = seg
  const x = Math.floor(cx / SCALE), y = Math.floor(cy / SCALE)
  const region = regionMap[y * width + x]
  const entry = entryOf[cy * width * SCALE + cx]
  if (analysis.regionEntry[region] === entry) return region
  // The nearer side first, as the outline came from there.
  const sideX = cx - x * SCALE < SCALE / 2 ? -1 : 1, sideY = cy - y * SCALE < SCALE / 2 ? -1 : 1
  for (const [dx, dy] of [[sideX, 0], [0, sideY], [-sideX, 0], [0, -sideY]]) {
    const xx = x + dx, yy = y + dy
    if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
    const other = regionMap[yy * width + xx]
    if (analysis.regionEntry[other] === entry) return other
  }
  return region
}

// Mix mode: flat numbered areas, one colour per wash of a mix.
function drawMixes(el) {
  const seg = analysis.segmentation
  const entryOf = areasAtCanvasSize()
  if (!entryOf) return
  const { width, height, regions } = seg
  const w = width * SCALE, h = height * SCALE
  el.width = w
  el.height = h
  const ctx = el.getContext('2d')
  const { view, outlines, numbers } = analysis.settings
  const original = view === 'original'
  // An outline runs through the canvas pixels that have another area to their right or below.
  const onOutline = (p, x, y) => (x < w - 1 && entryOf[p] !== entryOf[p + 1]) || (y < h - 1 && entryOf[p] !== entryOf[p + w])

  if (original) {
    drawPhoto(ctx, el)
    if (outlines) {
      // Light lines over the photo.
      const lines = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = y * w + x
          if (!onOutline(p, x, y)) continue
          lines[p * 4] = lines[p * 4 + 1] = lines[p * 4 + 2] = 255
          lines[p * 4 + 3] = 191
        }
      }
      paintPixels(ctx, el, lines, w, h)
    }
  } else {
    // With a colour selected, only its mix stays: all its washes, the rest of the picture goes blank.
    const colours = analysis.entries.map((e, index) => (shown(index) ? hexToRgb(analysis.displayHex(e)) : BLANK))
    const img = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        const colour = colours[entryOf[p]] ?? BLANK
        if (outlines && onOutline(p, x, y)) {
          // The line colour rgba(40, 36, 30, 0.55) over the area.
          img[p * 4] = colour[0] * 0.45 + 22
          img[p * 4 + 1] = colour[1] * 0.45 + 19.8
          img[p * 4 + 2] = colour[2] * 0.45 + 16.5
        } else {
          img[p * 4] = colour[0]
          img[p * 4 + 1] = colour[1]
          img[p * 4 + 2] = colour[2]
        }
        img[p * 4 + 3] = 255
      }
    }
    ctx.putImageData(new ImageData(img, w, h), 0, 0)
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

// Choosing a part of the picture for a close-up: a frame dragged over the canvas.
const framing = ref(false)
const frame = ref(null) // { from, to } in shares of the canvas while the frame is dragged
let skipClick = false // the click that ends a drag picks no area

function shareAt(event) {
  const rect = canvas.value.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
}
function startFrame(event) {
  if (!framing.value || event.button) return
  event.currentTarget.setPointerCapture(event.pointerId)
  const at = shareAt(event)
  frame.value = { from: at, to: at }
  hover.value = null
}
function moveFrame(event) {
  if (frame.value) frame.value = { from: frame.value.from, to: shareAt(event) }
}
function endFrame() {
  if (!frame.value) return
  const rect = closeupRect(frame.value.from, frame.value.to)
  frame.value = null
  skipClick = true
  // Too small a frame was a slip: the choice stays open for another try.
  if (!rect) return
  framing.value = false
  analysis.addCloseup(rect)
}
// The frame on screen, placed over the canvas inside the panel.
const frameStyle = computed(() => {
  const el = canvas.value
  const drawn = frame.value && closeupRect(frame.value.from, frame.value.to, 0)
  if (!el || !drawn) return { display: 'none' }
  return {
    left: `${el.offsetLeft + drawn.x * el.offsetWidth}px`,
    top: `${el.offsetTop + drawn.y * el.offsetHeight}px`,
    width: `${drawn.w * el.offsetWidth}px`,
    height: `${drawn.h * el.offsetHeight}px`,
  }
})

// The canvas pixel under the pointer and the working pixel it belongs to, or null outside the picture.
function pixelAt(event) {
  const size = analysis.layerMode ? analysis.layers : analysis.segmentation
  if (!size) return null
  const rect = canvas.value.getBoundingClientRect()
  const cx = Math.floor(((event.clientX - rect.left) / rect.width) * size.width * SCALE)
  const cy = Math.floor(((event.clientY - rect.top) / rect.height) * size.height * SCALE)
  const x = Math.floor(cx / SCALE), y = Math.floor(cy / SCALE)
  if (x < 0 || y < 0 || x >= size.width || y >= size.height) return null
  return { cx, cy, x, y }
}

// Mix mode: the recipe of the colour under the pointer follows the pointer.
function onMove(event) {
  const at = framing.value || analysis.layerMode || analysis.busy || analysis.settings.view === 'sketch' || !analysis.regionEntry ? null : pixelAt(event)
  const entry = at ? analysis.regionEntry[regionAtCanvasPixel(at.cx, at.cy)] : null
  // Nothing over the part of the picture that is blanked while one colour is selected.
  if (entry == null || !analysis.entries[entry] || (analysis.settings.view !== 'original' && !shown(entry))) hover.value = null
  else hover.value = { entry, x: event.clientX, y: event.clientY }
}

function onClick(event) {
  if (skipClick || framing.value) {
    skipClick = false
    return
  }
  const at = pixelAt(event)
  if (!at) return
  const { cx, cy, x, y } = at
  if (analysis.settings.view === 'sketch') return // nothing to pick in the sketch
  if (analysis.layerMode) {
    analysis.selectPoint({ x, y })
    return
  }
  if (!analysis.regionEntry) return
  const region = regionAtCanvasPixel(cx, cy)
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

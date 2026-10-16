<template>
  <!-- The picture fills the window behind everything else; it is moved and zoomed in place. -->
  <div
    ref="root"
    class="painting"
    :class="{ 'painting--moving': moving, 'painting--backdrop': backdrop }"
    @click="onClick"
    @wheel="onWheel"
    @pointerdown="onDown"
    @pointermove="onPointerMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @gesturestart.prevent="onGestureStart"
    @gesturechange.prevent="onGestureChange"
  >
    <canvas
      ref="canvas"
      class="painting__canvas"
      :class="{ 'painting__canvas--busy': analysis.busy && !backdrop, 'painting__canvas--framing': framing }"
      :style="canvasStyle"
      @mousemove="onMove"
      @mouseleave="hover = null"
      @pointerdown="startFrame"
      @pointermove="moveFrame"
      @pointerup="endFrame"
      @pointercancel="frame = null"
    ></canvas>
    <!-- No picture yet: the whole canvas is the way to the first one. -->
    <label v-if="!analysis.image && !analysis.busy && !backdrop" class="painting__welcome">
      <input class="painting__file" type="file" accept="image/*" @change="onWelcomeFile" />
      <span class="painting__welcome-text">
        {{ t('Welcome to {app}', { app: APP_NAME }) }}<br />
        <strong>{{ t('Load your first photo.') }}</strong><br />
        {{ t('Click anywhere here to choose one.') }}<br />
        {{ t('Or try one of the') }}
        <button class="painting__welcome-link" type="button" @click.prevent.stop="emit('show-samples')">{{ t('sample photos') }}</button>.
      </span>
    </label>
    <div v-if="frame" class="painting__frame" :style="frameStyle"></div>
    <!-- The spot whose colour is being looked at, blinking under the card. -->
    <span v-if="spot && !backdrop" class="painting__spot" :style="spotStyle" aria-hidden="true"></span>
    <div v-if="!backdrop" class="painting__tools">
      <!-- Until everything is unlocked: the plans, one click away. -->
      <button v-if="!pro.active" class="button button--secondary painting__pro" type="button" @click="pro.require(null, 'use everything')">
        {{ t('Get pro') }}
      </button>
      <button class="button button--ghost painting__tool" type="button" :data-hint="t('Fit')" @click="fit">
        <AppIcon name="zoom" :label="t('Fit the picture to the window')" />
      </button>
      <!-- A frame drawn on the base picture becomes a close-up: that part, analysed on its own. -->
      <button
        v-if="analysis.image && analysis.closeupId == null"
        class="button button--ghost painting__tool"
        :class="{ 'painting__tool--on': framing }"
        type="button"
        :aria-pressed="framing"
        :data-hint="t('Detail')"
        @click="framing = !framing"
      >
        <AppIcon name="frame" :label="framing ? t('Cancel choosing a part of the picture') : t('Zoom in on a part of the picture')" />
      </button>
      <ViewSwitch />
      <!-- What is drawn over the picture. -->
      <button
        class="button painting__tool"
        :class="{ 'button--active': analysis.settings.outlines }"
        type="button"
        :aria-pressed="analysis.settings.outlines"
        :data-hint="t('Outlines')"
        @click="analysis.settings.outlines = !analysis.settings.outlines"
      >
        <AppIcon name="outlines" :label="t('Show outlines')" />
      </button>
      <button
        class="button painting__tool"
        :class="{ 'button--active': analysis.settings.numbers }"
        type="button"
        :aria-pressed="analysis.settings.numbers"
        :data-hint="t('Numbers')"
        @click="analysis.settings.numbers = !analysis.settings.numbers"
      >
        <AppIcon name="numbers" :label="t('Show numbers')" />
      </button>
      <p v-if="analysis.busy" class="painting__status">{{ analysis.layerMode ? t('Planning layers…') : t('Analysing…') }}</p>
      <p v-else-if="framing && !frame" class="painting__status">{{ t('Drag a frame over the part to zoom in on') }}</p>
    </div>
    <!-- Without a paint the picture would be blank paper. One is enough: it is painted in washes. -->
    <p v-if="noPaints && !backdrop" class="painting__notice">{{ t('Put at least one colour in paintbox') }}</p>
    <RecipeTip v-if="hover" :index="hover.entry" :x="hover.x" :y="hover.y" />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { useProStore } from '../stores/pro.js'
import { hexToRgb, contrastText } from '../lib/color.js'
import { drawLayerView, labelFont, paintPixels } from './layerView.js'
import { smoothCurve } from '../lib/sketch.js'
import { upscaleAreas } from '../lib/smooth.js'
import RecipeTip from './RecipeTip.vue'
import AppIcon from './AppIcon.vue'
import ViewSwitch from './ViewSwitch.vue'
import { closeupRect } from '../lib/closeup.js'
import { APP_NAME } from '../config.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const SCALE = 2 // canvas pixels per working pixel – keeps outlines and numbers crisp
const MIN_LABEL_DIST = 5 // only number areas with enough room for a label
const BLANK = [255, 255, 255] // paper
// The Template view: lines and numbers light enough to disappear under the paint. Light blue with
// full blue and so no yellow: nothing a printer could print with its black ink, which is not
// soluble in water and would stay visible under the paint.
const TEMPLATE_LINE = [205, 230, 255]
const TEMPLATE_NUMBER = '#96c3ff'

// As the background behind signing in: the picture covers the window and only shows the recipe
// under the pointer; no tools, no moving, zooming or picking.
const props = defineProps({ backdrop: { type: Boolean, default: false } })
const emit = defineEmits(['show-samples'])

function onWelcomeFile(event) {
  const file = event.target.files?.[0]
  if (file) analysis.loadFile(file)
}

const analysis = useAnalysisStore()
const paints = usePaintsStore()
const pro = useProStore()
// The paint box in use holds no paint: none to paint with, or in layer mode none to glaze with.
const noPaints = computed(() => !!analysis.image && (analysis.layerMode ? !analysis.busy && !analysis.layers : paints.enabled.length === 0))
const canvas = ref(null)
const root = ref(null)
// The colour under the pointer and where the pointer is, for its recipe next to it.
const hover = ref(null)
// A recipe next to the pointer needs a pointer that hovers. A finger has none: there a tap on an
// area opens the inspector card instead (ColourInspector.vue).
const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false

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

// Saves the picture as it is drawn now (view, outlines, numbers) as a JPG, at the size of the canvas.
function exportJpg() {
  const el = canvas.value
  if (!el?.width) return
  // JPG has no transparency: the drawing goes on white paper.
  const sheet = document.createElement('canvas')
  sheet.width = el.width
  sheet.height = el.height
  const ctx = sheet.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sheet.width, sheet.height)
  ctx.drawImage(el, 0, 0)
  sheet.toBlob(
    (blob) => {
      if (!blob) return
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      // "Bielefeld (sample)" and "IMG_1234.jpeg" both become a plain file name.
      const name = analysis.imageName.replace(/\.\w+$/, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'picture'
      link.download = `${name}-${analysis.settings.view}.jpg`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    },
    'image/jpeg',
    0.92,
  )
}
defineExpose({ exportJpg })

// The Overlay view: the photo at half strength over the paint, to compare the two in place.
function overlayPhoto(ctx, el) {
  if (analysis.settings.view !== 'overlay' || !(analysis.adjusted || analysis.image)) return
  ctx.save()
  ctx.globalAlpha = 0.5
  drawPhoto(ctx, el)
  ctx.restore()
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
  // Nothing filled in: the paper with the areas and their numbers in light blue, to print and paint on.
  const template = view === 'template'
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
  } else if (template) {
    const img = new Uint8ClampedArray(w * h * 4).fill(255)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        if (onOutline(p, x, y)) img.set(TEMPLATE_LINE, p * 4)
      }
    }
    ctx.putImageData(new ImageData(img, w, h), 0, 0)
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
    // Under the numbers, so that they stay readable.
    overlayPhoto(ctx, el)
  }

  if (numbers) {
    labelFont(ctx, SCALE)
    for (const region of regions) {
      if (region.anchorDist < MIN_LABEL_DIST) continue
      const entryIndex = analysis.regionEntry[region.id]
      if (!original && !template && !shown(entryIndex)) continue
      const entry = analysis.entries[entryIndex]
      ctx.fillStyle = original ? '#ffffff' : template ? TEMPLATE_NUMBER : contrastText(analysis.displayHex(entry))
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
  overlayPhoto(ctx, el)

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

// The canvas pixel that was tapped, while its colour is looked at (ColourInspector.vue).
const spot = ref(null)
const spotStyle = computed(() => ({
  left: `${view.x + (spot.value.cx + 0.5) * view.k}px`,
  top: `${view.y + (spot.value.cy + 0.5) * view.k}px`,
}))
watch(
  () => analysis.inspected,
  (at) => {
    if (!at) spot.value = null
  },
)

// Choosing a part of the picture for a close-up: a frame dragged over the canvas.
const framing = ref(false)
const frame = ref(null) // { from, to } in shares of the canvas while the frame is dragged
// The click that ends a drag picks no area. Not every drag ends in a click (a pinch does not), so
// it is the time of the drag that counts, not a flag that would wait for the next click.
let draggedAt = -Infinity
const afterDrag = (event) => event.timeStamp - draggedAt < 400

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
  draggedAt = performance.now()
  // Too small a frame was a slip: the choice stays open for another try.
  if (!rect) return
  framing.value = false
  analysis.addCloseup(rect)
}
// The frame on screen, over the canvas where it lies in the window.
const frameStyle = computed(() => {
  const drawn = frame.value && closeupRect(frame.value.from, frame.value.to, 0)
  if (!drawn) return { display: 'none' }
  const w = size.width * view.k, h = size.height * view.k
  return { left: `${view.x + drawn.x * w}px`, top: `${view.y + drawn.y * h}px`, width: `${drawn.w * w}px`, height: `${drawn.h * h}px` }
})

// Where the picture lies in the window: its top left corner, and `k` screen pixels per canvas
// pixel. It starts fitted to the window and stays so (a new picture, another window size) until
// it is moved or zoomed; the zoom button fits it again.
const view = reactive({ x: 0, y: 0, k: 1 })
const size = reactive({ width: 0, height: 0 }) // of the canvas, as last drawn
const moving = ref(false)
let fitted = true
const MOST = 8 // screen pixels per canvas pixel at most
const DRAG = 4 // a pointer that moved less than this was a click

const canvasStyle = computed(() => ({ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }))

function fitScale() {
  const el = root.value
  if (!size.width || !el?.clientWidth) return 1
  const fill = props.backdrop ? Math.max : Math.min // cover the window, or fit into it
  return fill(el.clientWidth / size.width, el.clientHeight / size.height)
}
function fit() {
  const el = root.value
  if (!el || !size.width) return
  view.k = fitScale()
  view.x = (el.clientWidth - size.width * view.k) / 2
  view.y = (el.clientHeight - size.height * view.k) / 2
  fitted = true
}
// The picture never leaves the window: where it is larger than the window its edges stay outside
// or on the edge of the window, and where it is smaller it stays centred.
function clampView() {
  const el = root.value
  const w = size.width * view.k, h = size.height * view.k
  view.x = w <= el.clientWidth ? (el.clientWidth - w) / 2 : Math.min(0, Math.max(el.clientWidth - w, view.x))
  view.y = h <= el.clientHeight ? (el.clientHeight - h) / 2 : Math.min(0, Math.max(el.clientHeight - h, view.y))
}
function panBy(dx, dy) {
  view.x += dx
  view.y += dy
  fitted = false
  clampView()
}
// Zoom by `factor`, keeping the point of the picture at (cx, cy) of the window where it is.
function zoomAt(cx, cy, factor) {
  const rect = root.value.getBoundingClientRect()
  const px = cx - rect.left, py = cy - rect.top
  // Never smaller than fitted.
  const k = Math.min(MOST, Math.max(fitScale(), view.k * factor))
  view.x = px - (px - view.x) * (k / view.k)
  view.y = py - (py - view.y) * (k / view.k)
  view.k = k
  fitted = false
  clampView()
}

// A pinch on a trackpad arrives as a wheel with ctrl held; two fingers moved together as a plain wheel.
function onWheel(event) {
  if (props.backdrop) return
  event.preventDefault()
  hover.value = null
  if (event.ctrlKey || event.metaKey) zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.01))
  else panBy(-event.deltaX, -event.deltaY)
}
// Safari on the Mac reports the pinch as a gesture of its own.
let gestureScale = 1
function onGestureStart() {
  gestureScale = 1
}
function onGestureChange(event) {
  if (props.backdrop) return
  zoomAt(event.clientX, event.clientY, event.scale / gestureScale)
  gestureScale = event.scale
}

// Fingers and the mouse: one pointer dragged moves the picture, two pinch it (move and zoom at once).
const pointers = new Map()
let travelled = 0
const centre = () => {
  const [a, b] = [...pointers.values()]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
}
function onDown(event) {
  if (props.backdrop || event.button || event.target.closest('button')) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  travelled = 0
  // A second finger ends a frame that the first one began.
  if (pointers.size === 2) frame.value = null
}
function onPointerMove(event) {
  const last = pointers.get(event.pointerId)
  if (!last) return
  const at = { x: event.clientX, y: event.clientY }
  if (pointers.size === 2) {
    const before = centre()
    pointers.set(event.pointerId, at)
    const now = centre()
    panBy(now.x - before.x, now.y - before.y)
    zoomAt(now.x, now.y, now.d / before.d)
    draggedAt = performance.now()
    moving.value = true
    return
  }
  // While a frame is chosen, one pointer draws the frame.
  if (framing.value) return
  travelled += Math.hypot(at.x - last.x, at.y - last.y)
  if (travelled < DRAG) return
  pointers.set(event.pointerId, at)
  if (!moving.value) {
    moving.value = true
    hover.value = null
    root.value.setPointerCapture(event.pointerId)
  }
  panBy(at.x - last.x, at.y - last.y)
  draggedAt = performance.now()
}
function onUp(event) {
  if (!pointers.delete(event.pointerId)) return
  if (moving.value) draggedAt = performance.now()
  if (!pointers.size) moving.value = false
}

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
  if (!canHover) return
  const at = moving.value || framing.value || analysis.layerMode || analysis.busy || analysis.settings.view === 'sketch' || !analysis.regionEntry ? null : pixelAt(event)
  const entry = at ? analysis.regionEntry[regionAtCanvasPixel(at.cx, at.cy)] : null
  // Nothing over the part of the picture that is blanked while one colour is selected.
  if (entry == null || !analysis.entries[entry] || (analysis.settings.view !== 'original' && !shown(entry))) hover.value = null
  else hover.value = { entry, x: event.clientX, y: event.clientY }
}

function onClick(event) {
  if (props.backdrop || afterDrag(event) || framing.value || event.target.closest('button')) return
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
  hover.value = null
  // While one colour is shown on its own, a click on the blanked part brings the picture back.
  if (!shown(analysis.regionEntry[region])) return analysis.select(null)
  // Looking at a colour leaves the picture as it is; the same area again closes the card.
  analysis.inspect(analysis.inspected?.region === region ? null : region)
  spot.value = analysis.inspected ? { cx, cy } : null
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
  render,
)

// Draw, and fit the picture again when it has another size than the one before (a new photo, a close-up).
function render() {
  draw()
  const el = canvas.value
  if (!el || (el.width === size.width && el.height === size.height)) return
  size.width = el.width
  size.height = el.height
  fit()
}

let resizing = null
onMounted(() => {
  render()
  resizing = new ResizeObserver(() => (fitted ? fit() : clampView()))
  resizing.observe(root.value)
})
onBeforeUnmount(() => resizing?.disconnect())
</script>

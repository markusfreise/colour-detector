// Drawing of layer mode, shared by the picture on screen and the printed sheets.

import { renderLayers } from '../lib/layers.js'
import { contrastText } from '../lib/color.js'

const MIN_LABEL_DIST = 5 // only number areas with enough room for a label

// Working pixels (RGBA) stretched over the whole canvas.
export function paintPixels(ctx, el, rgba, width, height, smooth = false) {
  const off = document.createElement('canvas')
  off.width = width
  off.height = height
  off.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0)
  ctx.imageSmoothingEnabled = smooth
  ctx.drawImage(off, 0, 0, el.width, el.height)
}

// A line wherever `differs` says two neighbouring working pixels belong to different areas.
export function drawOutlines(ctx, width, height, scale, differs, style) {
  ctx.fillStyle = style
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (x < width - 1 && differs(p, p + 1)) ctx.fillRect((x + 1) * scale - 0.5, y * scale, 1, scale)
      if (y < height - 1 && differs(p, p + width)) ctx.fillRect(x * scale, (y + 1) * scale - 0.5, scale, 1)
    }
  }
}

export function labelFont(ctx, scale) {
  ctx.font = `600 ${11 * (scale / 2)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
}

/**
 * The paper with some of the layers on it.
 * @param {HTMLCanvasElement} el  resized to the picture
 * @param {object} result  from `layerImage`
 * @param {object} options
 *   show: per layer true / false / number of coats (see `compositeColours`);
 *   step: a step of result.steps: what that step paints in full colour and outlined, the rest faded;
 *   outlines: lines between areas that differ within the shown layers;
 *   numbers: with exactly one layer shown, its coats per area;
 *   backdrop: draws something else than the layers (the photo) before lines and numbers.
 */
export function drawLayerView(el, result, { show, step = null, outlines = true, numbers = true, scale = 2, backdrop = null }) {
  const { width, height, layers } = result
  el.width = width * scale
  el.height = height * scale
  const ctx = el.getContext('2d')
  if (backdrop) {
    backdrop(ctx, el)
  } else {
    const rgba = renderLayers(result, show)
    if (step) {
      // Where the brush goes in this step stays in full colour; the rest of the paper fades back.
      const map = layers[step.layer].coatMap
      for (let p = 0; p < map.length; p++) {
        if (map[p] >= step.coat) continue
        const o = p * 4
        rgba[o] = rgba[o] * 0.3 + 178.5
        rgba[o + 1] = rgba[o + 1] * 0.3 + 178.5
        rgba[o + 2] = rgba[o + 2] * 0.3 + 178.5
      }
    }
    paintPixels(ctx, el, rgba, width, height)
  }

  const light = !!backdrop
  if (step) {
    // The areas this step paints: where the layer gets this coat.
    const map = layers[step.layer].coatMap
    drawOutlines(ctx, width, height, scale, (p, q) => map[p] >= step.coat !== map[q] >= step.coat, light ? 'rgba(255,255,255,0.9)' : 'rgba(40,36,30,0.8)')
  } else if (outlines) {
    const maps = layers.filter((_, k) => show[k]).map((l) => l.coatMap)
    drawOutlines(ctx, width, height, scale, (p, q) => maps.some((map) => map[p] !== map[q]), light ? 'rgba(255,255,255,0.75)' : 'rgba(40,36,30,0.55)')
  }

  const shown = show.map((v, k) => (v ? k : -1)).filter((k) => k >= 0)
  if (numbers && !step && shown.length === 1) {
    // One layer on its own: the number of coats in every area that gets any.
    const layer = layers[shown[0]]
    labelFont(ctx, scale)
    for (const region of layer.regions) {
      if (!region.coats || region.anchorDist < MIN_LABEL_DIST) continue
      ctx.fillStyle = light ? '#ffffff' : contrastText(layer.hexes[region.coats])
      ctx.fillText(String(region.coats), (region.anchorX + 0.5) * scale, (region.anchorY + 0.5) * scale)
    }
  }
  return ctx
}

<template>
  <section v-if="sheets" class="layersheet">
    <h2 class="legend__title">{{ t('{name}: layers', { name: analysis.imageName }) }}</h2>
    <img class="layersheet__picture layersheet__picture--finished" :src="sheets.finished" :alt="t('The finished picture, all layers')" />
    <table class="layersheet__table">
      <thead>
        <tr><th>{{ t('Layer') }}</th><th>{{ t('Paint@@column') }}</th><th>{{ t('Wash') }}</th><th>{{ t('Coats') }}</th><th>{{ t('Of image') }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in sheets.rows" :key="row.number">
          <td>{{ row.number }}</td>
          <td><span class="swatch swatch--small" :style="{ background: row.hex }"></span> {{ row.name }}</td>
          <td>{{ row.dilution }}</td>
          <td>{{ row.coats }}</td>
          <td>{{ row.share }}%</td>
        </tr>
      </tbody>
    </table>
    <figure v-for="row in sheets.rows" :key="`sheet-${row.number}`" class="layersheet__layer">
      <figcaption class="layersheet__caption">
        <strong>{{ t('{kind} {n}: {name}, {wash}', { kind: t(typeof row.number === 'number' ? 'Layer' : 'Accent'), n: row.number, name: row.name, wash: row.dilution }) }}</strong>
        <span>{{ row.instruction }}</span>
      </figcaption>
      <img class="layersheet__picture" :src="row.image" :alt="t('Layer {n}: {name}', { n: row.number, name: row.name })" />
    </figure>
    <p class="layersheet__note">
      {{
        t('The colours are estimates from one swatch per paint. Opaque or granulating paints glaze less cleanly than shown: test every wash on a scrap first.')
      }}
    </p>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { paintNumber } from '../lib/paintbox.js'
import { drawLayerView } from './layerView.js'
import { useText, washGuideText } from '../i18n/index.js'

const { t, paintName } = useText()
const analysis = useAnalysisStore()
const paints = usePaintsStore()
// Built when printing starts: one picture per layer costs too much to keep up to date all the time.
const sheets = ref(null)

function build() {
  const result = analysis.layerMode ? analysis.layers : null
  if (!result) {
    sheets.value = null
    return
  }
  const canvas = document.createElement('canvas')
  const picture = (options) => {
    drawLayerView(canvas, result, { scale: 2, ...options })
    return canvas.toDataURL('image/png')
  }
  const percent = (share) => Math.round(share * 100) || '<1'
  sheets.value = {
    finished: picture({ show: result.layers.map(() => true), outlines: true, numbers: false }),
    rows: result.layers.map((layer, k) => ({ layer, k })).filter(({ layer }) => layer.top > 0).map(({ layer, k }) => {
      const paint = paints.byId[layer.paintId]
      const accent = layer.kind === 'accent'
      const used = layer.coats.filter((c) => c.share > 0).length
      const more = Array.from({ length: Math.max(0, used - 1) }, (_, i) =>
        t('Coat {n} on the {numbers}.', { n: i + 2, numbers: Array.from({ length: used - i - 1 }, (__, j) => t('{n}s', { n: i + 2 + j })).join(t(' and ')) }),
      )
      return {
        number: analysis.layerNumbers[k],
        name: ((name) => (accent ? t('{name} (accent)', { name }) : name))(paint ? `${paintNumber(paint.number)} ${paintName(paint)}` : layer.paintId),
        hex: layer.hexes[1],
        dilution: layer.guide ? washGuideText(t, layer) : t(layer.dilution).replace(/ \(.*\)$/, ''),
        coats: used,
        share: percent(layer.coats[0]?.share ?? 0),
        instruction: accent
          ? t('A strong wash on the numbered shapes, painted last, when everything else is dry.')
          : [t('Coat 1 on every numbered area.'), ...more, t('Let each coat dry.')].join(' '),
        image: picture({ show: result.layers.map((_, j) => j === k), outlines: true, numbers: true }),
      }
    }),
  }
}

const clear = () => { sheets.value = null }
onMounted(() => {
  window.addEventListener('beforeprint', build)
  window.addEventListener('afterprint', clear)
})
onUnmounted(() => {
  window.removeEventListener('beforeprint', build)
  window.removeEventListener('afterprint', clear)
})
</script>

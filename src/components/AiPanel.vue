<template>
  <section class="panel ai">
    <header class="ai__header">
      <h2 class="panel__title">AI <span class="ai__badge">your own key</span></h2>
      <div class="segmented">
        <button
          v-for="choice in choices"
          :key="choice.label"
          type="button"
          class="segmented__option"
          :class="{ 'segmented__option--active': analysis.settings.ai === choice.value }"
          :aria-pressed="analysis.settings.ai === choice.value"
          :title="choice.title"
          @click="analysis.setAi(choice.value)"
        >
          {{ choice.label }}
        </button>
      </div>
    </header>
    <p class="field__hint">
      An AI model looks at the picture and says what matters in it: the colours to mix, the paints, the small details to
      keep and to paint last, and the main shapes for the sketch. The app works out the areas and the recipes from that.
    </p>

    <template v-if="analysis.settings.ai">
      <div class="field">
        <span class="field__label">Provider</span>
        <div class="segmented segmented--fill">
          <button
            v-for="(info, id) in providers"
            :key="id"
            type="button"
            class="segmented__option"
            :class="{ 'segmented__option--active': ai.provider === id }"
            :aria-pressed="ai.provider === id"
            @click="setProvider(id)"
          >
            {{ info.name }}
          </button>
        </div>
      </div>

      <label class="field">
        <span class="field__label">Model</span>
        <select v-if="ai.info.models.length" v-model="ai.models[ai.provider]" class="input" @change="ai.persist()">
          <option v-for="m in ai.info.models" :key="m.id" :value="m.id">{{ m.name }} ({{ m.note }})</option>
        </select>
        <input v-else v-model.trim="ai.models[ai.provider]" class="input" type="text" maxlength="60" spellcheck="false" @change="ai.persist()" />
      </label>

      <label class="field">
        <span class="field__label">Your API key</span>
        <input
          v-model.trim="ai.keys[ai.provider]"
          class="input"
          type="password"
          autocomplete="off"
          spellcheck="false"
          :placeholder="ai.info.keyHint"
          @change="ai.persist()"
        />
        <span class="field__hint">
          Stays in this browser and is sent only to {{ ai.info.company }}.
          <a :href="ai.info.keysUrl" target="_blank" rel="noopener">Get a key</a>
        </span>
      </label>
      <label class="checkbox ai__check">
        <input v-model="ai.remember" type="checkbox" @change="ai.persist()" />
        Remember the key on this device
      </label>

      <label class="checkbox ai__check ai__consent">
        <input v-model="ai.consent[ai.provider]" type="checkbox" @change="ai.persist()" />
        <span>
          I agree that a reduced copy of the picture ({{ size.width }} x {{ size.height }} pixels, without file data such as place or
          date) and the names and colours of my paints are sent to {{ ai.info.company }} when I press the button below.
          {{ ai.info.company }} processes them under its own terms, on my account there. Nothing passes through a server of this app.
        </span>
      </label>

      <div class="ai__ask">
        <button class="button button--secondary" type="button" :disabled="!ai.ready || !analysis.pixels || analysis.aiBusy" @click="analysis.askAi()">
          {{ analysis.aiBusy ? 'Asking…' : current ? 'Ask again' : 'Ask about this picture' }}
        </button>
        <span class="field__hint">{{ estimateText }}</span>
      </div>
      <p v-if="analysis.aiError" class="controls__error">{{ analysis.aiError }}</p>

      <template v-if="current">
        <p class="ai__notes">{{ current.plan.notes }}</p>
        <ul v-if="current.plan.mixes.length" class="ai__mixes">
          <li v-for="mix in current.plan.mixes" :key="mix.hex" class="ai__mix">
            <span class="swatch swatch--small" :style="{ background: mix.hex }"></span>
            {{ mix.name }}
          </li>
        </ul>
        <template v-if="current.plan.details.length">
          <h3 class="editor__subtitle">Details to keep</h3>
          <p class="ai__details">{{ current.plan.details.map((d) => d.name).join(', ') }}</p>
          <label v-if="wash" class="checkbox ai__check">
            <input v-model="analysis.settings.details" type="checkbox" />
            <span>
              Show the final wash:
              <span class="swatch swatch--small ai__wash" :style="{ background: wash.hex }"></span>
              {{ wash.paint }}, {{ wash.dilution }}, with a fine brush on {{ wash.shapes }} small {{ wash.shapes === 1 ? 'shape' : 'shapes' }}
            </span>
          </label>
          <p v-else class="field__hint">No fine dark shapes found there for a final wash.</p>
        </template>
        <p class="field__hint">The Sketch view shows the outlines to start from<template v-if="current.plan.subjects.length">, firm for {{ current.plan.subjects.map((s) => s.name).join(', ') }}</template>.</p>
        <p v-if="matchText" class="field__hint">{{ matchText }}</p>
        <p class="field__hint">
          {{ current.usage.input.toLocaleString('en') }} tokens in, {{ current.usage.output.toLocaleString('en') }} out<template v-if="current.cost != null">
            · {{ cents(current.cost) }}</template>
        </p>
      </template>
      <p v-else-if="analysis.aiPlan" class="field__hint">The last answer was for another picture or other colours settings.</p>

      <button v-if="ai.key || ai.agreed" class="button button--ghost ai__forget" type="button" @click="ai.forget()">Forget key and consent</button>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { useAiStore } from '../stores/ai.js'
import { AI_PROVIDERS, aiEstimate, aiImageSize } from '../lib/ai.js'

const analysis = useAnalysisStore()
const paints = usePaintsStore()
const ai = useAiStore()
const providers = AI_PROVIDERS

const choices = [
  { value: false, label: 'Off', title: 'The app chooses colours and paints itself' },
  { value: true, label: 'On', title: 'An AI model chooses colours and paints, once you ask it' },
]

// The answer that belongs to the picture as it is now.
const current = computed(() => (analysis.aiPlan?.key === analysis.aiKey ? analysis.aiPlan : null))
// The final wash of details, as the store found it in the picture.
const wash = computed(() => {
  const details = analysis.aiDetails?.key === analysis.aiKey ? analysis.aiDetails : null
  if (!details) return null
  return { hex: details.hex, shapes: details.shapes, dilution: details.dilution.replace(/ \(.*\)$/, '') || 'strong', paint: paints.byId[details.paintId]?.name ?? details.paintId }
})
// How close the picture is to the photo with and without the AI's choices, once both were seen.
const matchText = computed(() => {
  const match = analysis.aiMatch?.key === analysis.aiKey ? analysis.aiMatch : null
  const on = match?.[`${analysis.settings.mode}-on`], off = match?.[`${analysis.settings.mode}-off`]
  if (on == null) return ''
  return off == null
    ? `Distance to the photo with AI: ${on.toFixed(1)}. Switch AI off once to compare.`
    : `Distance to the photo: ${on.toFixed(1)} with AI, ${off.toFixed(1)} without (lower is closer).`
})
const size = computed(() => aiImageSize(analysis.pixels?.width ?? 800, analysis.pixels?.height ?? 600))
const cents = (dollars) => `${(dollars * 100).toFixed(dollars < 0.001 ? 2 : 1)} US cents`
const estimateText = computed(() => {
  if (!analysis.pixels) return ''
  const pool = paints.activeBox.auto ? paints.autoCandidates : paints.enabled
  const { usage, cost } = aiEstimate(ai.provider, ai.model, { width: analysis.pixels.width, height: analysis.pixels.height, paints: pool })
  const tokens = `about ${Math.round((usage.input + usage.output) / 100) * 100} tokens`
  return cost == null ? `${tokens}; the price depends on the model` : `${tokens}, about ${cents(cost)} on your account`
})

function setProvider(id) {
  ai.provider = id
  ai.persist()
}
</script>

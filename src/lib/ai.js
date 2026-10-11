// AI as the painter's eye: a language model looks at a small copy of the photo and the list of
// paints and decides which colours to mix, with which paints, and which paints to glaze with.
// The areas, the recipes and the layers are still worked out by the app from those decisions:
// a language model cannot draw areas, but it sees what a picture is about.
//
// This file only builds requests and reads answers; sending them is up to the caller.

// Longest side of the copy that is sent. Colour decisions need no detail, and a picture costs
// ceil(width / 28) * ceil(height / 28) tokens.
export const AI_IMAGE_SIDE = 560
// Answers are short: a list of colours, two lists of ids and a few sentences. The limit leaves
// room for models that think before they answer; only what is used is paid for.
export const AI_MAX_OUTPUT = 3000

// Prices in US dollars per million tokens, as published by the providers in October 2026.
// OpenAI models change often: the model is typed in, and no price is assumed for it.
export const AI_PROVIDERS = {
  anthropic: {
    name: 'Claude (Anthropic)',
    company: 'Anthropic',
    keyHint: 'sk-ant-...',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-haiku-5-5', name: 'Haiku 5.5', note: 'cheapest', input: 0.1, output: 0.5 },
      { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', note: 'recommended', input: 2, output: 10 },
      { id: 'claude-opus-5-5', name: 'Opus 5.5', note: 'most careful', input: 4, output: 20 },
    ],
    defaultModel: 'claude-sonnet-5-5',
  },
  openai: {
    name: 'OpenAI',
    company: 'OpenAI',
    keyHint: 'sk-...',
    keysUrl: 'https://platform.openai.com/api-keys',
    models: [],
    defaultModel: 'gpt-5.4',
  },
}

/** Size of the copy that is sent: the picture scaled down to AI_IMAGE_SIDE on its longer side. */
export function aiImageSize(width, height, side = AI_IMAGE_SIDE) {
  const scale = Math.min(1, side / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Tokens a picture of that size costs with Claude. */
export function imageTokens(width, height) {
  return Math.ceil(width / 28) * Math.ceil(height / 28)
}

const SYSTEM = `You plan watercolour paintings. You get a photo and the painter's paints, each as "id | name | colour of a medium wash on white paper".
Decide like an experienced watercolourist who simplifies: what matters in the picture gets a colour of its own, even when it is small (lips, eyes, a light, a sign); large areas of similar colour share one.
- mixes: the colours to mix, as they should look on paper at their strongest. Lighter versions of a colour are the same mix with more water, so do not list them separately. Paper white needs no mix.
- paints: the paints to mix those colours from. As few as do the job; every mix must be reachable with at most three of them.
- layers: paints for glazing in thin layers over each other instead, in painting order from the lightest to the darkest. Transparent, clean paints first; one dark paint last for the shadows.
- notes: two or three short sentences of advice for painting this picture. Plain words, no formatting. Do not describe or identify people.
Use only ids from the list.`

const SCHEMA = {
  type: 'object',
  properties: {
    mixes: {
      type: 'array',
      description: 'The colours to mix, most important first.',
      items: {
        type: 'object',
        properties: {
          hex: { type: 'string', description: 'Colour as #rrggbb' },
          name: { type: 'string', description: 'What it is for, in two or three words' },
        },
        required: ['hex', 'name'],
        additionalProperties: false,
      },
    },
    paints: { type: 'array', items: { type: 'string' }, description: 'Ids of the paints to mix with' },
    layers: { type: 'array', items: { type: 'string' }, description: 'Ids of the paints to glaze with, light to dark' },
    notes: { type: 'string' },
  },
  required: ['mixes', 'paints', 'layers', 'notes'],
  additionalProperties: false,
}

/** The question that goes with the picture. Paints are listed in one short line each. */
export function aiQuestion(paints, { colours = 12, layers = 5 } = {}) {
  const list = paints.map((p) => `${p.id} | ${p.name} | ${p.hex}`).join('\n')
  return `Paints:\n${list}\n\nPlan this picture with at most ${colours} mixes and ${layers} layers.`
}

/**
 * The request for a provider.
 * @param {{provider: string, model: string, key: string, image: {base64: string, mediaType: string},
 *   paints: Array<{id, name, hex}>, colours?: number, layers?: number}} options
 * @returns {{url: string, init: {method: string, headers: object, body: string}}}
 */
export function aiRequest({ provider, model, key, image, paints, colours, layers }) {
  const question = aiQuestion(paints, { colours, layers })
  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          max_completion_tokens: AI_MAX_OUTPUT,
          messages: [
            { role: 'system', content: SYSTEM },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.base64}`, detail: 'low' } },
                { type: 'text', text: question },
              ],
            },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'painting_plan', strict: true, schema: SCHEMA } },
        }),
      },
    }
  }
  return {
    url: 'https://api.anthropic.com/v1/messages',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // The key is the user's own and stays on their device: the request goes straight to the provider.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: AI_MAX_OUTPUT,
        system: SYSTEM,
        // The answer as JSON of this shape (a forced tool call is not accepted by every model).
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
              { type: 'text', text: question },
            ],
          },
        ],
      }),
    },
  }
}

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Reads a provider's answer. Whatever does not fit is dropped: unknown ids, broken colours,
 * repeats. Throws with a readable message when the answer holds no plan or reports an error.
 * @returns {{plan: {mixes: Array<{hex, name}>, paints: string[], layers: string[], notes: string},
 *   usage: {input: number, output: number}}}
 */
export function readAiAnswer(provider, answer, paints, { colours = 32, layers = 6 } = {}) {
  if (answer?.error) throw new Error(answer.error.message || 'The provider reported an error.')
  let raw, usage
  if (provider === 'openai') {
    const message = answer?.choices?.[0]?.message
    if (message?.refusal) throw new Error(`The model declined: ${message.refusal}`)
    try { raw = JSON.parse(message?.content ?? '') } catch { raw = null }
    usage = { input: answer?.usage?.prompt_tokens ?? 0, output: answer?.usage?.completion_tokens ?? 0 }
  } else {
    const text = answer?.content?.find((block) => block.type === 'text')?.text
    try { raw = JSON.parse(text ?? '') } catch { raw = null }
    const u = answer?.usage ?? {}
    usage = { input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), output: u.output_tokens ?? 0 }
    if (!raw && answer?.stop_reason === 'refusal') throw new Error('The model declined to plan this picture.')
    if (!raw && answer?.stop_reason === 'max_tokens') throw new Error('The answer was cut off. Please ask again.')
  }
  if (!raw || typeof raw !== 'object') throw new Error('The answer held no plan.')

  const known = new Set(paints.map((p) => p.id))
  const ids = (list, most) => [...new Set((Array.isArray(list) ? list : []).filter((id) => known.has(id)))].slice(0, most)
  const seen = new Set()
  const mixes = []
  for (const mix of Array.isArray(raw.mixes) ? raw.mixes : []) {
    const hex = String(mix?.hex ?? '').trim().toLowerCase()
    if (!HEX.test(hex) || seen.has(hex)) continue
    seen.add(hex)
    mixes.push({ hex, name: String(mix?.name ?? '').slice(0, 60) })
    if (mixes.length >= colours) break
  }
  const plan = { mixes, paints: ids(raw.paints, 24), layers: ids(raw.layers, layers), notes: String(raw.notes ?? '').slice(0, 600) }
  if (!plan.mixes.length && !plan.layers.length) throw new Error('The answer held no usable plan.')
  return { plan, usage }
}

/** Cost of a call in US dollars, or null when the model's price is not known. */
export function aiCost(provider, model, usage) {
  const price = AI_PROVIDERS[provider]?.models.find((m) => m.id === model)
  if (!price) return null
  return (usage.input * price.input + usage.output * price.output) / 1e6
}

/** What a call is expected to cost before it is made: the picture, the paints and a typical answer. */
export function aiEstimate(provider, model, { width, height, paints }) {
  const size = aiImageSize(width, height)
  // Roughly four characters to a token for the instructions and the paint list.
  const text = Math.round((SYSTEM.length + aiQuestion(paints).length + JSON.stringify(SCHEMA).length) / 4)
  const usage = { input: imageTokens(size.width, size.height) + text, output: 600 }
  return { usage, cost: aiCost(provider, model, usage) }
}

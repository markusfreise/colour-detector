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
- details: the few small things that carry the picture and must not get lost: eyes, a mouth, a highlight, a window, a sign. At most eight, the most important first. For each its name, its box in the picture and its own colour. They are painted last, with a fine brush.
- subjects: the one to four main subjects, each with its box. Their outlines become the pencil sketch the painter starts from.
- detail_paint: one dark paint for the last, fine wash that draws the dark details (lashes, pupils, the line of a mouth, a shadow edge).
- Boxes are [left, top, right, bottom] in pixels of the picture as you see it; its size is given below.
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
    details: {
      type: 'array',
      description: 'Small things that carry the picture, most important first.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'What it is, in two or three words' },
          box: { type: 'array', items: { type: 'number' }, description: '[left, top, right, bottom] in pixels' },
          hex: { type: 'string', description: 'Its own colour as #rrggbb' },
        },
        required: ['name', 'box', 'hex'],
        additionalProperties: false,
      },
    },
    subjects: {
      type: 'array',
      description: 'The main subjects, for the pencil sketch.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          box: { type: 'array', items: { type: 'number' }, description: '[left, top, right, bottom] in pixels' },
        },
        required: ['name', 'box'],
        additionalProperties: false,
      },
    },
    detail_paint: { type: 'string', description: 'Id of the dark paint for the final wash' },
    paints: { type: 'array', items: { type: 'string' }, description: 'Ids of the paints to mix with' },
    layers: { type: 'array', items: { type: 'string' }, description: 'Ids of the paints to glaze with, light to dark' },
    notes: { type: 'string' },
  },
  required: ['mixes', 'details', 'subjects', 'detail_paint', 'paints', 'layers', 'notes'],
  additionalProperties: false,
}

/** The question that goes with the picture. Paints are listed in one short line each. */
export function aiQuestion(paints, { colours = 12, layers = 5, width = AI_IMAGE_SIDE, height = AI_IMAGE_SIDE } = {}) {
  const list = paints.map((p) => `${p.id} | ${p.name} | ${p.hex}`).join('\n')
  return `Paints:\n${list}\n\nThe picture is ${width} x ${height} pixels. Plan it with at most ${colours} mixes and ${layers} layers.`
}

/**
 * The request for a provider.
 * @param {{provider: string, model: string, key: string, image: {base64: string, mediaType: string, width: number, height: number},
 *   paints: Array<{id, name, hex}>, colours?: number, layers?: number}} options
 * @returns {{url: string, init: {method: string, headers: object, body: string}}}
 */
export function aiRequest({ provider, model, key, image, paints, colours, layers }) {
  const question = aiQuestion(paints, { colours, layers, width: image.width, height: image.height })
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
 * Boxes come in pixels of the picture that was sent (`size`) and leave as parts of it, 0..1.
 * @returns {{plan: {mixes: Array<{hex, name}>, details: Array<{name, box, hex}>, subjects: Array<{name, box}>,
 *   detailPaint: string|null, paints: string[], layers: string[], notes: string}, usage: {input: number, output: number}}}
 */
export function readAiAnswer(provider, answer, paints, { colours = 32, layers = 6, size = { width: AI_IMAGE_SIDE, height: AI_IMAGE_SIDE } } = {}) {
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
  // A box as parts of the picture, in order and inside it; null when it is none.
  const boxOf = (box) => {
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return null
    const part = (v, side) => Math.min(1, Math.max(0, v / side))
    const x = [part(box[0], size.width), part(box[2], size.width)].sort((a, b) => a - b)
    const y = [part(box[1], size.height), part(box[3], size.height)].sort((a, b) => a - b)
    return x[1] > x[0] && y[1] > y[0] ? [x[0], y[0], x[1], y[1]] : null
  }
  const boxed = (list, most) => (Array.isArray(list) ? list : [])
    .map((item) => ({ name: String(item?.name ?? '').slice(0, 60), box: boxOf(item?.box), hex: String(item?.hex ?? '').trim().toLowerCase() }))
    .filter((item) => item.box)
    .slice(0, most)
  const plan = {
    mixes,
    details: boxed(raw.details, 8).map(({ name, box, hex }) => ({ name, box, hex: HEX.test(hex) ? hex : null })),
    subjects: boxed(raw.subjects, 4).map(({ name, box }) => ({ name, box })),
    detailPaint: known.has(raw.detail_paint) ? raw.detail_paint : null,
    paints: ids(raw.paints, 24),
    layers: ids(raw.layers, layers),
    notes: String(raw.notes ?? '').slice(0, 600),
  }
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
  const usage = { input: imageTokens(size.width, size.height) + text, output: 900 }
  return { usage, cost: aiCost(provider, model, usage) }
}

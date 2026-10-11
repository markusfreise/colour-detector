import { describe, it, expect } from 'vitest'
import { aiRequest, readAiAnswer, aiCost, aiEstimate, aiImageSize, imageTokens, aiQuestion, AI_IMAGE_SIDE } from '../lib/ai.js'
import { segmentImage } from '../lib/segment.js'

const paints = [
  { id: 'y', name: 'Yellow', hex: '#fae409' },
  { id: 'b', name: 'Blue', hex: '#2b61ab' },
  { id: 'r', name: 'Red', hex: '#e6331d' },
]
const image = { base64: 'AAAA', mediaType: 'image/jpeg' }

describe('the copy that is sent', () => {
  it('is scaled down to the longer side and never up', () => {
    expect(aiImageSize(1600, 1200)).toEqual({ width: AI_IMAGE_SIDE, height: 420 })
    expect(aiImageSize(300, 400)).toEqual({ width: 300, height: 400 })
    expect(imageTokens(560, 420)).toBe(20 * 15)
  })
})

describe('requests', () => {
  it('sends picture, paints and key to Anthropic and asks for the plan as JSON', () => {
    const { url, init } = aiRequest({ provider: 'anthropic', model: 'claude-sonnet-5-5', key: 'k', image, paints, colours: 8, layers: 4 })
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('k')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.tool_choice).toBeUndefined()
    expect(body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } })
    expect(body.messages[0].content[1].text).toContain('y | Yellow | #fae409')
    expect(body.messages[0].content[1].text).toContain('at most 8 mixes and 4 layers')
  })

  it('sends the same to OpenAI in its own shape', () => {
    const { url, init } = aiRequest({ provider: 'openai', model: 'some-model', key: 'k', image, paints })
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.headers.authorization).toBe('Bearer k')
    const body = JSON.parse(init.body)
    expect(body.messages[1].content[0].image_url.url).toBe('data:image/jpeg;base64,AAAA')
    expect(body.response_format.json_schema.strict).toBe(true)
  })

  it('lists every paint in one line', () => {
    expect(aiQuestion(paints).split('\n').filter((line) => line.includes(' | '))).toHaveLength(3)
  })
})

describe('answers', () => {
  const plan = {
    mixes: [{ hex: '#AA3322', name: 'roof' }, { hex: 'nonsense', name: 'x' }, { hex: '#aa3322', name: 'again' }, { hex: '#102030', name: 'shadow' }],
    paints: ['r', 'r', 'unknown', 'b'],
    layers: ['y', 'b', 'nope'],
    notes: 'Start with the sky.',
  }

  it('reads an Anthropic answer and drops what does not fit', () => {
    const answer = { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(plan) }], usage: { input_tokens: 1400, output_tokens: 500 } }
    const read = readAiAnswer('anthropic', answer, paints)
    expect(read.plan.mixes).toEqual([{ hex: '#aa3322', name: 'roof' }, { hex: '#102030', name: 'shadow' }])
    expect(read.plan.paints).toEqual(['r', 'b'])
    expect(read.plan.layers).toEqual(['y', 'b'])
    expect(read.usage).toEqual({ input: 1400, output: 500 })
  })

  it('reads an OpenAI answer', () => {
    const answer = { choices: [{ message: { content: JSON.stringify(plan) } }], usage: { prompt_tokens: 900, completion_tokens: 300 } }
    const read = readAiAnswer('openai', answer, paints, { colours: 1 })
    expect(read.plan.mixes).toHaveLength(1)
    expect(read.usage).toEqual({ input: 900, output: 300 })
  })

  it('reports errors and empty answers in words', () => {
    expect(() => readAiAnswer('anthropic', { error: { message: 'invalid x-api-key' } }, paints)).toThrow('invalid x-api-key')
    expect(() => readAiAnswer('anthropic', { content: [{ type: 'text', text: 'hello' }] }, paints)).toThrow('no plan')
    expect(() => readAiAnswer('openai', { choices: [{ message: { content: 'not json' } }] }, paints)).toThrow('no plan')
    expect(() => readAiAnswer('anthropic', { content: [{ type: 'text', text: JSON.stringify({ mixes: [], paints: [], layers: [], notes: '' }) }] }, paints)).toThrow('no usable plan')
    expect(() => readAiAnswer('anthropic', { content: [], stop_reason: 'max_tokens' }, paints)).toThrow('cut off')
  })
})

describe('cost', () => {
  it('follows the price list and is unknown for unlisted models', () => {
    expect(aiCost('anthropic', 'claude-sonnet-5-5', { input: 1000, output: 1000 })).toBeCloseTo(0.012, 6)
    expect(aiCost('openai', 'whatever', { input: 1000, output: 1000 })).toBeNull()
  })

  it('estimates a call at about a cent with the recommended model', () => {
    const { usage, cost } = aiEstimate('anthropic', 'claude-sonnet-5-5', { width: 800, height: 600, paints })
    expect(usage.input).toBeGreaterThan(300)
    expect(cost).toBeGreaterThan(0.004)
    expect(cost).toBeLessThan(0.02)
  })
})

describe('given colours as the mixes', () => {
  it('assigns the picture to them instead of finding its own', () => {
    const w = 60, h = 40
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let p = 0; p < w * h; p++) {
      const left = p % w < 30
      rgba.set(left ? [200, 60, 50, 255] : [40, 90, 180, 255], p * 4)
    }
    const seg = segmentImage(rgba, w, h, { colours: 12, simplify: 0, anchors: ['#c83c32', '#285ab4', '#00ff00'] })
    const groups = new Set(seg.clusters.filter((c) => c.pixelCount).map((c) => c.group))
    expect([...groups].sort()).toEqual([0, 1])
    expect(seg.clusters.find((c) => c.group === 0 && c.pixelCount).pixelCount).toBe(30 * 40)
  })
})

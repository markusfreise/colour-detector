// A link that brings back the settings and the paints of a picture, for the QR code on the printed
// sheet: <app>#restore=<code>. The photo is not in it (a QR code holds a few hundred characters);
// after opening the link the photo is loaded again. The code is the data as JSON, compressed
// (deflate) and in base64url, so that the QR code stays small enough to scan from paper.
//
// Data, version 1: { v: 1, s: settings that differ from the defaults, p: the paints of the palette
// (left out on Auto), l: the base paints of layer mode (left out on Auto), o: boxes Auto leaves out
// (left out when as by default) }. A paint is its id, or for a paint of one's own, which another
// device does not know, [series, number, name, colour].

const PREFIX = '#restore='
/** Error correction of the QR code: the lowest, so that it stays small; clean paper needs no more. */
export const QR_LEVEL = 'L'
// Settings of the photo or of the moment, not of the way of working.
const LEFT_OUT = new Set(['ai', 'blockingSplit'])
const AUTO_OFF_DEFAULT = ['travelbox']

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

async function squeeze(bytes, stream) {
  const piped = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(piped).arrayBuffer())
}

function toBase64url(bytes) {
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(code) {
  const text = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(text, (c) => c.charCodeAt(0))
}

/** The code for a picture's settings and palette. `paints`: all paints known, to tell own ones apart. */
export async function restoreCode({ settings, defaults, palette, paints }) {
  const s = {}
  for (const [key, value] of Object.entries(settings)) if (!LEFT_OUT.has(key) && !same(value, defaults[key])) s[key] = value
  const byId = new Map(paints.map((p) => [p.id, p]))
  const ref = (id) => {
    const paint = byId.get(id)
    if (!paint) return null
    return paint.custom ? [paint.vendor, String(paint.number), paint.name, paint.hex] : id
  }
  const data = { v: 1, s }
  if (!palette.auto) data.p = palette.paintIds.map(ref).filter(Boolean)
  if (!palette.layerAuto) data.l = palette.layerIds.map(ref).filter(Boolean)
  if (!same(palette.autoOff ?? AUTO_OFF_DEFAULT, AUTO_OFF_DEFAULT)) data.o = palette.autoOff
  const json = new TextEncoder().encode(JSON.stringify(data))
  return toBase64url(await squeeze(json, new CompressionStream('deflate-raw')))
}

/** The link: the app's address with the code. */
export const restoreLink = (base, code) => `${base.replace(/#.*$/, '')}${PREFIX}${code}`

/** The code in a location hash, or null. */
export const restoreCodeOf = (hash) => (String(hash ?? '').startsWith(PREFIX) ? hash.slice(PREFIX.length) : null)

/**
 * A code read back: { settings, palette } with the palette as far as the code has it (`paints` and
 * `layerPaints` hold ids and own paints as in the data); null when it is not a code of ours.
 */
export async function readRestoreCode(code) {
  try {
    const json = await squeeze(fromBase64url(code), new DecompressionStream('deflate-raw'))
    const data = JSON.parse(new TextDecoder().decode(json))
    if (data?.v !== 1 || typeof data.s !== 'object') return null
    const paints = (list) => (Array.isArray(list) ? list.filter((p) => typeof p === 'string' || (Array.isArray(p) && p.length === 4 && /^#[0-9a-f]{6}$/i.test(p[3]))) : null)
    return {
      settings: data.s,
      palette: { auto: !data.p, paints: paints(data.p), layerAuto: !data.l, layerPaints: paints(data.l), autoOff: Array.isArray(data.o) ? data.o : AUTO_OFF_DEFAULT },
    }
  } catch {
    return null
  }
}

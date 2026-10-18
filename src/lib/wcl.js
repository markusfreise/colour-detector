// A picture as a file of its own, `<name>.wcl`: a zip (zip.js) with the photo as the collection
// keeps it and `picture.json` with what makes the plan: settings, colour changes, the paints of
// the palette and the photo's hash. Opening it brings the picture back as it was saved, on this
// device or another. The hash is taken as written, as the collection takes it: an unlock belongs
// to an account, so a file passed on unlocks nothing for anybody else. Whether it was a sample is
// not taken: samples are unlocked for everybody, and a file could claim it for any photo.

import { readZip, writeZip } from './zip.js'

export const WCL_FORMAT = 'watercolourlove-picture'
export const WCL_VERSION = 1
export const WCL_TYPE = 'application/x-watercolourlove'

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const PHOTO_MIME = Object.fromEntries(Object.entries(PHOTO_TYPES).map(([mime, ext]) => [ext, mime]))

/** Whether a chosen file is a picture file rather than a photo. */
export const isWclFile = (file) => /\.wcl$/i.test(file?.name ?? '')

/** A file name for the picture: "Llyn Idwal (sample)" becomes "Llyn-Idwal-sample.wcl". */
export function wclName(name) {
  const base = String(name ?? '').replace(/\.\w+$/, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  return `${base || 'picture'}.wcl`
}

/**
 * The file of a saved picture.
 * @param {{ name, blob: Blob, settings, edits, palette, picture }} record a record of the collection
 * @returns {Promise<Blob>}
 */
export async function wclFile(record, { appVersion = '', savedAt = new Date() } = {}) {
  const ext = PHOTO_TYPES[record.blob.type] ?? 'jpg'
  const photo = `photo.${ext}`
  const meta = {
    format: WCL_FORMAT,
    version: WCL_VERSION,
    app: appVersion,
    savedAt: savedAt.toISOString(),
    name: record.name,
    photo,
    picture: { hash: record.picture?.hash ?? null, sample: !!record.picture?.sample },
    settings: record.settings,
    edits: record.edits ?? [],
    palette: record.palette ?? null,
  }
  const bytes = writeZip(
    [
      { name: 'picture.json', data: new TextEncoder().encode(JSON.stringify(meta, null, 2)) },
      { name: photo, data: new Uint8Array(await record.blob.arrayBuffer()) },
    ],
    savedAt,
  )
  return new Blob([bytes], { type: WCL_TYPE })
}

/**
 * A picture file back as a record for `loadSaved`, without an id: it is not in the collection
 * until it is saved there.
 * @param {Blob} file
 */
export async function readWcl(file) {
  let files
  try {
    files = readZip(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('This is not a Watercolourlove picture file.')
  }
  let meta
  try {
    meta = JSON.parse(new TextDecoder().decode(files['picture.json']))
  } catch {
    meta = null
  }
  if (meta?.format !== WCL_FORMAT || !files[meta.photo]) throw new Error('This is not a Watercolourlove picture file.')
  if (meta.version > WCL_VERSION) throw new Error('This picture file comes from a newer version of the app.')
  const ext = meta.photo.split('.').pop()
  return {
    name: meta.name || file.name?.replace(/\.wcl$/i, '') || 'Picture',
    blob: new Blob([files[meta.photo]], { type: PHOTO_MIME[ext] ?? 'image/jpeg' }),
    settings: meta.settings ?? {},
    edits: meta.edits ?? [],
    palette: meta.palette ?? undefined,
    picture: meta.picture?.hash ? { sample: false, hash: String(meta.picture.hash) } : undefined,
    app: meta.app ?? '',
  }
}

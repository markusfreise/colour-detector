import { describe, expect, it } from 'vitest'
import { crc32, readZip, writeZip } from '../lib/zip.js'
import { isWclFile, readWcl, wclFile, wclName, WCL_FORMAT } from '../lib/wcl.js'
import de from '../i18n/de.js'

const bytes = (text) => new TextEncoder().encode(text)

describe('zip', () => {
  it('has the CRC-32 of zip', () => {
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })

  it('reads back what it packs, names in UTF-8 included', () => {
    const photo = new Uint8Array(5000).map((_, i) => (i * 7) % 256)
    const zip = writeZip([
      { name: 'picture.json', data: bytes('{"a":1}') },
      { name: 'Größe.jpg', data: photo },
    ])
    const files = readZip(zip)
    expect(Object.keys(files)).toEqual(['picture.json', 'Größe.jpg'])
    expect(new TextDecoder().decode(files['picture.json'])).toBe('{"a":1}')
    expect([...files['Größe.jpg']]).toEqual([...photo])
  })

  it('refuses what is not a zip, and a damaged one', () => {
    expect(() => readZip(bytes('just text, long enough to look for an end record'))).toThrow('not a zip')
    const zip = writeZip([{ name: 'a.txt', data: bytes('hello') }])
    zip[30 + 5] ^= 0xff // a byte of the stored file
    expect(() => readZip(zip)).toThrow('damaged zip')
  })
})

describe('picture file (.wcl)', () => {
  const record = {
    id: 'img-1',
    name: 'Llyn Idwal (sample)',
    blob: new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])], { type: 'image/jpeg' }),
    settings: { colours: 12, details: 3, grid: 'white' },
    edits: [{ index: 2, targetHex: '#aabbcc', chosen: 1 }],
    palette: [{ id: 'h-494', hex: '#2d3c8c' }],
    picture: { hash: 'abc123', sample: false },
  }

  it('names the file after the picture', () => {
    expect(wclName('Llyn Idwal (sample)')).toBe('Llyn-Idwal-sample.wcl')
    expect(wclName('IMG_1234.jpeg')).toBe('IMG-1234.wcl')
    expect(wclName('')).toBe('picture.wcl')
    expect(isWclFile({ name: 'a.WCL' })).toBe(true)
    expect(isWclFile({ name: 'a.jpg' })).toBe(false)
  })

  it('brings the picture back as it was saved, without an id', async () => {
    const file = await wclFile(record, { appVersion: '0.9.0' })
    const back = await readWcl(file)
    expect(back.id).toBeUndefined()
    expect(back.name).toBe(record.name)
    expect(back.settings).toEqual(record.settings)
    expect(back.edits).toEqual(record.edits)
    expect(back.palette).toEqual(record.palette)
    expect(back.picture).toEqual(record.picture)
    expect(back.app).toBe('0.9.0')
    expect(back.picture.sample).toBe(false)
    expect(back.blob.type).toBe('image/jpeg')
    expect([...new Uint8Array(await back.blob.arrayBuffer())]).toEqual([...new Uint8Array(await record.blob.arrayBuffer())])
  })

  it('never opens a picture as a sample, whatever the file says', async () => {
    const sample = await readWcl(await wclFile({ ...record, picture: { hash: null, sample: true } }))
    expect(sample.picture).toBeUndefined() // loadSaved then takes the hash of the photo itself
    const claimed = await readWcl(await wclFile({ ...record, picture: { hash: 'abc123', sample: true } }))
    expect(claimed.picture).toEqual({ sample: false, hash: 'abc123' })
  })

  it('is a zip with picture.json and the photo', async () => {
    const files = readZip(new Uint8Array(await (await wclFile(record)).arrayBuffer()))
    const meta = JSON.parse(new TextDecoder().decode(files['picture.json']))
    expect(meta.format).toBe(WCL_FORMAT)
    expect(files[meta.photo]).toBeDefined()
  })

  it('refuses other files and files of a newer version, in words the app translates', async () => {
    await expect(readWcl(new Blob([bytes('no zip at all, not even close to one')]))).rejects.toThrow('This is not a Watercolourlove picture file.')
    const other = new Blob([writeZip([{ name: 'picture.json', data: bytes('{"format":"something else"}') }])])
    await expect(readWcl(other)).rejects.toThrow('This is not a Watercolourlove picture file.')
    const newer = new Blob([writeZip([{ name: 'picture.json', data: bytes(JSON.stringify({ format: WCL_FORMAT, version: 99, photo: 'photo.jpg' })) }, { name: 'photo.jpg', data: bytes('x') }])])
    await expect(readWcl(newer)).rejects.toThrow('This picture file comes from a newer version of the app.')
    expect('This is not a Watercolourlove picture file.' in de).toBe(true)
    expect('This picture file comes from a newer version of the app.' in de).toBe(true)
  })
})

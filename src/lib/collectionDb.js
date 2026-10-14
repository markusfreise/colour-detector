// The picture collection lives in IndexedDB: one record per saved picture, with the image itself as a Blob.
// Next to it, in a store of its own, the picture used last, so that it opens again next time.
const DB_NAME = 'colour-detector'
const STORE = 'images'
const LAST = 'last'

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of [STORE, LAST]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run(mode, work, store = STORE) {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = work(tx.objectStore(store))
      tx.oncomplete = () => resolve(request?.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export const listImages = () => run('readonly', (store) => store.getAll())
export const getImage = (id) => run('readonly', (store) => store.get(id))
export const putImage = (record) => run('readwrite', (store) => store.put(record))
export const deleteImage = (id) => run('readwrite', (store) => store.delete(id))

// The picture used last: one record, { id: 'picture', name, blob, settings, edits, savedId, updatedAt }.
export const getLast = () => run('readonly', (store) => store.get('picture'), LAST)
export const putLast = (record) => run('readwrite', (store) => store.put({ ...record, id: 'picture' }), LAST)

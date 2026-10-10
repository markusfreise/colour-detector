// The picture collection lives in IndexedDB: one record per saved picture, with the image itself as a Blob.
const DB_NAME = 'colour-detector'
const STORE = 'images'

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run(mode, work) {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = work(tx.objectStore(STORE))
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

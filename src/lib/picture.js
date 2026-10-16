// What a picture is known by for its credits. The photo never leaves the device: the app hashes its
// bytes, and the account API is told only a key made from that hash and the salt of the account,
// so the same photo gives another key in another account. Close-ups and changed settings stay part
// of the picture; another photo is another picture.

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** SHA-256 of bytes (ArrayBuffer or typed array), as 64 hex digits. */
export async function sha256Hex(bytes) {
  return hex(await crypto.subtle.digest('SHA-256', bytes))
}

/** The key the account API knows a picture by: SHA-256 of "<salt>:<hash>" (server/ledger.php). */
export async function pictureKey(salt, hash) {
  return sha256Hex(new TextEncoder().encode(`${salt}:${hash}`))
}

/** The hash of a file or a blob, from its bytes as they are. */
export async function hashOf(blob) {
  return sha256Hex(await blob.arrayBuffer())
}

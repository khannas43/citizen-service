/** Admit Unit C strong opaque ETag / If-Match tokens (FB-E2 mirrors Form-builder). */

const BASE64URL_BODY = /^[A-Za-z0-9_-]+$/

function decodeBase64UrlToBytes(opaque) {
  if (!BASE64URL_BODY.test(opaque) || opaque.includes('=')) {
    return null
  }
  const padLength = (4 - (opaque.length % 4)) % 4
  const padded = opaque.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength)
  try {
    const binary = globalThis.atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

function encodeBytesToBase64Url(bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/**
 * Admit a single quoted strong ETag with exact unpadded Base64URL of eight bytes.
 * Rejects W/, wildcard, comma lists, padding, whitespace, controls, embedded quotes.
 */
export function admitStrongEtag(raw) {
  if (typeof raw !== 'string') {
    return { ok: false }
  }
  if (raw.length === 0 || raw !== raw.trim()) {
    return { ok: false }
  }
  if (raw.length >= 2 && raw.slice(0, 2).toLowerCase() === 'w/') {
    return { ok: false }
  }
  if (raw === '*') {
    return { ok: false }
  }
  if (raw.includes(',')) {
    return { ok: false }
  }
  if (raw.length < 2 || raw.charAt(0) !== '"' || raw.charAt(raw.length - 1) !== '"') {
    return { ok: false }
  }
  const opaque = raw.slice(1, -1)
  if (opaque.length === 0 || opaque.includes('"') || opaque.includes('=')) {
    return { ok: false }
  }
  for (let index = 0; index < opaque.length; index += 1) {
    const code = opaque.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) {
      return { ok: false }
    }
  }
  const decoded = decodeBase64UrlToBytes(opaque)
  if (decoded === null || decoded.byteLength !== 8) {
    return { ok: false }
  }
  if ((decoded[0] & 0x80) !== 0) {
    return { ok: false }
  }
  const canonical = encodeBytesToBase64Url(decoded)
  if (canonical !== opaque) {
    return { ok: false }
  }
  return { ok: true, etag: raw }
}

/** Format a strong ETag for tests / deterministic mocks. */
export function formatStrongEtagForTests(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new TypeError('revision must be a non-negative safe integer')
  }
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, Math.floor(revision / 0x1_0000_0000), false)
  view.setUint32(4, revision >>> 0, false)
  return `"${encodeBytesToBase64Url(bytes)}"`
}

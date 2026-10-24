/** Safe own-property reads that never invoke getters or toJSON. */

import { isExactDenseDataArray } from './clone-json-safe.js'

export function ownStringKeys(value) {
  try {
    if (value === null || typeof value !== 'object') {
      return null
    }
    const keys = Reflect.ownKeys(value)
    const out = []
    for (const key of keys) {
      if (typeof key !== 'string') {
        return null
      }
      out.push(key)
    }
    return out
  } catch {
    return null
  }
}

export function getDataOwn(value, key) {
  try {
    if (value === null || typeof value !== 'object') {
      return { ok: false }
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (
      !descriptor ||
      !('value' in descriptor) ||
      descriptor.get ||
      descriptor.set ||
      descriptor.enumerable !== true
    ) {
      return { ok: false }
    }
    return { ok: true, value: descriptor.value }
  } catch {
    return { ok: false }
  }
}

export function isPlainDataObject(value) {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false
    }
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      return false
    }
    const keys = ownStringKeys(value)
    if (keys === null) {
      return false
    }
    for (const key of keys) {
      if (!getDataOwn(value, key).ok) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

/** @deprecated Prefer isExactDenseDataArray — kept as alias for call sites. */
export function isDenseDataArray(value) {
  return isExactDenseDataArray(value)
}

export { isExactDenseDataArray }

export function exactKeySet(keys, required, optional = []) {
  if (keys === null) {
    return false
  }
  const allowed = new Set([...required, ...optional])
  if (keys.length < required.length || keys.length > allowed.size) {
    return false
  }
  const seen = new Set()
  for (const key of keys) {
    if (!allowed.has(key) || seen.has(key)) {
      return false
    }
    seen.add(key)
  }
  for (const key of required) {
    if (!seen.has(key)) {
      return false
    }
  }
  return true
}

export function unicodeCodePointCount(value) {
  let count = 0
  for (const codePoint of value) {
    void codePoint
    count += 1
  }
  return count
}

export function arraysEqualExact(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

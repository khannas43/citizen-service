/**
 * Governance JSON-safe clone-before-inspection (FB-E2.1).
 * Never throws to callers — returns a typed rejected result.
 */

export const CLONE_MAX_DEPTH = 64
export const CLONE_MAX_NODES = 10_000

/**
 * @typedef {{ readonly ok: true, readonly value: unknown } | { readonly ok: false }} CloneJsonSafeResult
 */

function isForbiddenHostObject(value) {
  if (value instanceof Date) return true
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof File !== 'undefined' && value instanceof File) return true
  if (typeof Map !== 'undefined' && value instanceof Map) return true
  if (typeof Set !== 'undefined' && value instanceof Set) return true
  if (typeof WeakMap !== 'undefined' && value instanceof WeakMap) return true
  if (typeof WeakSet !== 'undefined' && value instanceof WeakSet) return true
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return true
  if (typeof RegExp !== 'undefined' && value instanceof RegExp) return true
  if (typeof Error !== 'undefined' && value instanceof Error) return true
  return false
}

function admitArrayLengthDescriptor(value) {
  let lengthDescriptor
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  } catch {
    return { ok: false }
  }
  if (
    !lengthDescriptor ||
    !('value' in lengthDescriptor) ||
    lengthDescriptor.get ||
    lengthDescriptor.set ||
    lengthDescriptor.enumerable === true ||
    typeof lengthDescriptor.value !== 'number' ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return { ok: false }
  }
  return { ok: true, length: lengthDescriptor.value }
}

/**
 * Exact dense ordinary array check used by admission and clone.
 */
export function isExactDenseDataArray(value) {
  try {
    if (value === null || typeof value !== 'object') return false
    if (!Array.isArray(value)) return false
    if (Object.getPrototypeOf(value) !== Array.prototype) return false

    const lengthAdmit = admitArrayLengthDescriptor(value)
    if (!lengthAdmit.ok) return false
    const length = lengthAdmit.length

    const ownKeys = Reflect.ownKeys(value)
    const expected = new Set()
    for (let index = 0; index < length; index += 1) {
      expected.add(String(index))
    }
    expected.add('length')
    if (ownKeys.length !== expected.size) return false

    for (const key of ownKeys) {
      if (typeof key === 'symbol') return false
      if (!expected.has(key)) return false
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor) || descriptor.get || descriptor.set) {
        return false
      }
      if (key === 'length') {
        if (descriptor.enumerable === true) return false
        if (descriptor.value !== length) return false
        continue
      }
      // Index properties must be enumerable data values (no holes / accessors).
      if (descriptor.enumerable !== true) return false
      if (!Object.prototype.hasOwnProperty.call(value, key)) return false
    }

    for (let index = 0; index < length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return false
    }
    return true
  } catch {
    return false
  }
}

function cloneNode(value, depth, seen, nodeCount) {
  if (nodeCount.count >= CLONE_MAX_NODES) {
    return { ok: false }
  }
  nodeCount.count += 1

  if (value === null) {
    return { ok: true, value: null }
  }

  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') {
    return { ok: true, value }
  }
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      return { ok: false }
    }
    return { ok: true, value }
  }
  if (
    valueType === 'undefined' ||
    valueType === 'bigint' ||
    valueType === 'symbol' ||
    valueType === 'function'
  ) {
    return { ok: false }
  }
  if (valueType !== 'object') {
    return { ok: false }
  }

  if (depth > CLONE_MAX_DEPTH) {
    return { ok: false }
  }

  if (isForbiddenHostObject(value)) {
    return { ok: false }
  }

  if (seen.has(value)) {
    return { ok: false }
  }

  if (Array.isArray(value)) {
    if (!isExactDenseDataArray(value)) {
      return { ok: false }
    }
    seen.add(value)
    const length = Object.getOwnPropertyDescriptor(value, 'length').value
    const out = new Array(length)
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index)
      if (!descriptor || !('value' in descriptor) || descriptor.get || descriptor.set) {
        return { ok: false }
      }
      const child = cloneNode(descriptor.value, depth + 1, seen, nodeCount)
      if (!child.ok) return { ok: false }
      out[index] = child.value
    }
    seen.delete(value)
    return { ok: true, value: out }
  }

  let proto
  try {
    proto = Object.getPrototypeOf(value)
  } catch {
    return { ok: false }
  }
  if (proto !== Object.prototype && proto !== null) {
    return { ok: false }
  }

  let ownKeys
  try {
    ownKeys = Reflect.ownKeys(value)
  } catch {
    return { ok: false }
  }

  seen.add(value)
  const out = Object.create(null)
  for (const key of ownKeys) {
    if (typeof key === 'symbol') {
      return { ok: false }
    }
    let descriptor
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch {
      return { ok: false }
    }
    if (
      !descriptor ||
      !('value' in descriptor) ||
      descriptor.get ||
      descriptor.set ||
      descriptor.enumerable !== true
    ) {
      return { ok: false }
    }
    const child = cloneNode(descriptor.value, depth + 1, seen, nodeCount)
    if (!child.ok) return { ok: false }
    out[key] = child.value
  }
  seen.delete(value)
  return { ok: true, value: out }
}

/**
 * Strict JSON-safe deep clone. Never throws for hostile input.
 * @param {unknown} value
 * @returns {CloneJsonSafeResult}
 */
export function cloneJsonSafe(value) {
  try {
    return cloneNode(value, 0, new WeakSet(), { count: 0 })
  } catch {
    return { ok: false }
  }
}

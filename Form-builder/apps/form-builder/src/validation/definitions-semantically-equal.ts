import type { FormDefinition } from '@dg20/form-contract'

const MAX_EQUALITY_DEPTH = 64
const MAX_EQUALITY_NODES = 50_000

function isPlainObject(value: object): boolean {
  try {
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  } catch {
    return false
  }
}

function readOwnEnumerableData(
  obj: object,
  key: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    const desc = Object.getOwnPropertyDescriptor(obj, key)
    if (!desc || desc.get !== undefined || desc.set !== undefined || desc.enumerable !== true) {
      return { ok: false }
    }
    return { ok: true, value: desc.value }
  } catch {
    return { ok: false }
  }
}

function readArrayLength(arr: object): number | null {
  try {
    const desc = Object.getOwnPropertyDescriptor(arr, 'length')
    if (
      !desc ||
      desc.get !== undefined ||
      desc.set !== undefined ||
      typeof desc.value !== 'number' ||
      !Number.isSafeInteger(desc.value) ||
      desc.value < 0
    ) {
      return null
    }
    return desc.value
  } catch {
    return null
  }
}

function jsonValuesEqual(
  left: unknown,
  right: unknown,
  visiting: Set<object>,
  depth: number,
  counter: { nodes: number },
): boolean {
  if (left === right) {
    if (left === null) {
      return true
    }
    const sameType = typeof left
    if (sameType === 'string' || sameType === 'boolean') {
      return true
    }
    if (sameType === 'number') {
      return Number.isFinite(left)
    }
    if (sameType === 'object') {
      return true
    }
    // undefined, function, symbol, bigint, etc. are not JSON values.
    return false
  }
  if (depth > MAX_EQUALITY_DEPTH) {
    return false
  }
  counter.nodes += 1
  if (counter.nodes > MAX_EQUALITY_NODES) {
    return false
  }

  if (left === null || right === null) {
    return false
  }

  const leftType = typeof left
  const rightType = typeof right
  if (leftType !== rightType) {
    return false
  }

  if (leftType === 'number') {
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return false
    }
    // JSON semantics: -0 and 0 compare equal.
    return left === right
  }

  if (leftType === 'string' || leftType === 'boolean') {
    return left === right
  }

  if (leftType !== 'object') {
    return false
  }

  const leftObj = left as object
  const rightObj = right as object

  try {
    if (Object.getOwnPropertySymbols(leftObj).length > 0) {
      return false
    }
    if (Object.getOwnPropertySymbols(rightObj).length > 0) {
      return false
    }
  } catch {
    return false
  }

  if (visiting.has(leftObj) || visiting.has(rightObj)) {
    return false
  }

  if (Array.isArray(leftObj) || Array.isArray(rightObj)) {
    if (!Array.isArray(leftObj) || !Array.isArray(rightObj)) {
      return false
    }
    try {
      if (Object.getPrototypeOf(leftObj) !== Array.prototype) {
        return false
      }
      if (Object.getPrototypeOf(rightObj) !== Array.prototype) {
        return false
      }
    } catch {
      return false
    }

    const leftLength = readArrayLength(leftObj)
    const rightLength = readArrayLength(rightObj)
    if (leftLength === null || rightLength === null || leftLength !== rightLength) {
      return false
    }

    visiting.add(leftObj)
    visiting.add(rightObj)
    try {
      for (let index = 0; index < leftLength; index += 1) {
        const leftItem = readOwnEnumerableData(leftObj, String(index))
        const rightItem = readOwnEnumerableData(rightObj, String(index))
        if (!leftItem.ok || !rightItem.ok) {
          return false
        }
        if (!jsonValuesEqual(leftItem.value, rightItem.value, visiting, depth + 1, counter)) {
          return false
        }
      }
      return true
    } finally {
      visiting.delete(leftObj)
      visiting.delete(rightObj)
    }
  }

  if (!isPlainObject(leftObj) || !isPlainObject(rightObj)) {
    return false
  }

  let leftKeys: string[]
  let rightKeys: string[]
  try {
    leftKeys = Object.keys(leftObj).sort()
    rightKeys = Object.keys(rightObj).sort()
  } catch {
    return false
  }

  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) {
      return false
    }
  }

  visiting.add(leftObj)
  visiting.add(rightObj)
  try {
    for (const key of leftKeys) {
      const leftValue = readOwnEnumerableData(leftObj, key)
      const rightValue = readOwnEnumerableData(rightObj, key)
      if (!leftValue.ok || !rightValue.ok) {
        return false
      }
      if (!jsonValuesEqual(leftValue.value, rightValue.value, visiting, depth + 1, counter)) {
        return false
      }
    }
    return true
  } finally {
    visiting.delete(leftObj)
    visiting.delete(rightObj)
  }
}

/**
 * Structural equality for committed Form Definitions (FB-D6.1.1).
 * Object key insertion order is ignored; array order is significant.
 * Never invokes getters/toJSON; never throws for hostile input; never mutates inputs.
 */
export function definitionsSemanticallyEqual(left: FormDefinition, right: FormDefinition): boolean {
  if (left === right) {
    return true
  }
  try {
    return jsonValuesEqual(left, right, new Set(), 0, { nodes: 0 })
  } catch {
    return false
  }
}

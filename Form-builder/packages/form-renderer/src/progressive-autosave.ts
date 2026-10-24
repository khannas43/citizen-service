import type { JsonObject, JsonValue } from '@dg20/form-contract'

/**
 * Host-injected progressive autosave (FB-B2 / B2.1).
 * The renderer owns the contract and state machine only —
 * hosts own identity, auth, HTTP, persistence, encryption, and audit.
 */

export type ProgressiveAutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

export interface ProgressiveAutosaveRequest {
  readonly serviceId: string
  readonly formVersion: number
  readonly completedStepId: string
  readonly completedStepIndex: number
  readonly formData: JsonObject
  readonly signal: AbortSignal
}

export interface ProgressiveAutosaveAdapter {
  saveProgress(request: ProgressiveAutosaveRequest): Promise<void>
}

/**
 * Narrow status callback payload. Never includes formData, errors, stacks,
 * AbortSignal, credentials, or persistence responses.
 */
export interface ProgressiveAutosaveStatusData {
  readonly status: Exclude<ProgressiveAutosaveStatus, 'idle'>
  readonly serviceId: string
  readonly formVersion: number
  readonly stepId: string
  readonly stepIndex: number
}

/** Bounded clone limits (documented) — prevent stack/CPU abuse from hostile trees. */
export const AUTOSAVE_SNAPSHOT_MAX_DEPTH = 64
export const AUTOSAVE_SNAPSHOT_MAX_NODES = 10_000

export type AutosaveSnapshotFailureReason =
  | 'root_not_object'
  | 'undefined_value'
  | 'non_finite_number'
  | 'prohibited_type'
  | 'cycle'
  | 'accessor_property'
  | 'symbol_key'
  | 'sparse_array'
  | 'unexpected_property'
  | 'depth_exceeded'
  | 'node_limit'
  | 'inspection_failed'

export type AutosaveSnapshotResult =
  | { readonly ok: true; readonly snapshot: JsonObject }
  | { readonly ok: false; readonly reason: AutosaveSnapshotFailureReason }

function safeGetPrototypeOf(value: object): object | null | undefined {
  try {
    return Object.getPrototypeOf(value)
  } catch {
    return undefined
  }
}

function isPlainObject(value: object): boolean {
  const proto = safeGetPrototypeOf(value)
  if (proto === undefined) {
    return false
  }
  return proto === Object.prototype || proto === null
}

function isProhibitedObject(value: object): boolean {
  try {
    if (typeof File !== 'undefined' && value instanceof File) {
      return true
    }
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      return true
    }
    if (value instanceof Date) {
      return true
    }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return true
    }
    if (
      value instanceof Map ||
      value instanceof Set ||
      value instanceof WeakMap ||
      value instanceof WeakSet
    ) {
      return true
    }
    if (value instanceof Error) {
      return true
    }
    if (typeof URL !== 'undefined' && value instanceof URL) {
      return true
    }
    if (typeof RegExp !== 'undefined' && value instanceof RegExp) {
      return true
    }
  } catch {
    return true
  }
  return false
}

function defineDataProperty(target: object, key: string, value: JsonValue): boolean {
  try {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    return true
  } catch {
    return false
  }
}

function ownKeysSafe(value: object): PropertyKey[] | null {
  try {
    return Reflect.ownKeys(value)
  } catch {
    return null
  }
}

function descriptorSafe(value: object, key: PropertyKey): PropertyDescriptor | null | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key)
  } catch {
    return undefined
  }
}

function cloneJsonValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
  counter: { nodes: number },
):
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly reason: AutosaveSnapshotFailureReason } {
  if (depth > AUTOSAVE_SNAPSHOT_MAX_DEPTH) {
    return { ok: false, reason: 'depth_exceeded' }
  }
  counter.nodes += 1
  if (counter.nodes > AUTOSAVE_SNAPSHOT_MAX_NODES) {
    return { ok: false, reason: 'node_limit' }
  }

  if (value === null) {
    return { ok: true, value: null }
  }
  if (value === undefined) {
    return { ok: false, reason: 'undefined_value' }
  }
  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') {
    return { ok: true, value: value as string | boolean }
  }
  if (valueType === 'number') {
    const num = value as number
    if (!Number.isFinite(num)) {
      return { ok: false, reason: 'non_finite_number' }
    }
    return { ok: true, value: num }
  }
  if (valueType === 'bigint' || valueType === 'symbol' || valueType === 'function') {
    return { ok: false, reason: 'prohibited_type' }
  }
  if (valueType !== 'object') {
    return { ok: false, reason: 'prohibited_type' }
  }

  const obj = value as object
  if (seen.has(obj)) {
    return { ok: false, reason: 'cycle' }
  }
  if (isProhibitedObject(obj)) {
    return { ok: false, reason: 'prohibited_type' }
  }

  const keys = ownKeysSafe(obj)
  if (keys === null) {
    return { ok: false, reason: 'inspection_failed' }
  }

  if (Array.isArray(obj)) {
    seen.add(obj)
    let length = 0
    try {
      length = obj.length
    } catch {
      seen.delete(obj)
      return { ok: false, reason: 'inspection_failed' }
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      seen.delete(obj)
      return { ok: false, reason: 'prohibited_type' }
    }

    for (const key of keys) {
      if (typeof key === 'symbol') {
        seen.delete(obj)
        return { ok: false, reason: 'symbol_key' }
      }
      if (key === 'length') {
        continue
      }
      const desc = descriptorSafe(obj, key)
      if (desc === undefined) {
        seen.delete(obj)
        return { ok: false, reason: 'inspection_failed' }
      }
      if (desc === null) {
        continue
      }
      if (desc.get !== undefined || desc.set !== undefined) {
        seen.delete(obj)
        return { ok: false, reason: 'accessor_property' }
      }
      const asIndex = Number(key)
      const isIndex =
        Number.isInteger(asIndex) && String(asIndex) === key && asIndex >= 0 && asIndex < length
      if (!isIndex || !desc.enumerable) {
        seen.delete(obj)
        return { ok: false, reason: 'unexpected_property' }
      }
    }

    const out: JsonValue[] = []
    for (let index = 0; index < length; index += 1) {
      const key = String(index)
      let hasIndex = false
      try {
        hasIndex = Object.prototype.hasOwnProperty.call(obj, key)
      } catch {
        seen.delete(obj)
        return { ok: false, reason: 'inspection_failed' }
      }
      if (!hasIndex) {
        seen.delete(obj)
        return { ok: false, reason: 'sparse_array' }
      }
      const desc = descriptorSafe(obj, key)
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        seen.delete(obj)
        return { ok: false, reason: desc ? 'accessor_property' : 'inspection_failed' }
      }
      const entry = desc.value
      const cloned = cloneJsonValue(entry, seen, depth + 1, counter)
      if (!cloned.ok) {
        seen.delete(obj)
        return cloned
      }
      out.push(cloned.value)
    }
    seen.delete(obj)
    return { ok: true, value: out }
  }

  if (!isPlainObject(obj)) {
    return { ok: false, reason: 'prohibited_type' }
  }

  seen.add(obj)
  const out = Object.create(null) as Record<string, JsonValue>
  for (const key of keys) {
    if (typeof key === 'symbol') {
      seen.delete(obj)
      return { ok: false, reason: 'symbol_key' }
    }
    const stringKey = String(key)
    const desc = descriptorSafe(obj, stringKey)
    if (desc === undefined) {
      seen.delete(obj)
      return { ok: false, reason: 'inspection_failed' }
    }
    if (desc === null) {
      continue
    }
    if (desc.get !== undefined || desc.set !== undefined) {
      seen.delete(obj)
      return { ok: false, reason: 'accessor_property' }
    }
    if (!desc.enumerable) {
      seen.delete(obj)
      return { ok: false, reason: 'unexpected_property' }
    }
    if (desc.value === undefined) {
      seen.delete(obj)
      return { ok: false, reason: 'undefined_value' }
    }
    const cloned = cloneJsonValue(desc.value, seen, depth + 1, counter)
    if (!cloned.ok) {
      seen.delete(obj)
      return cloned
    }
    if (!defineDataProperty(out, stringKey, cloned.value)) {
      seen.delete(obj)
      return { ok: false, reason: 'inspection_failed' }
    }
  }
  seen.delete(obj)
  return { ok: true, value: out }
}

/**
 * Creates a detached JSON-compatible snapshot for autosave.
 * Never throws for hostile values — returns a machine-readable failure.
 * Adapter mutation of the result must never affect renderer state.
 */
export function createAutosaveSnapshot(value: unknown): AutosaveSnapshotResult {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, reason: 'root_not_object' }
    }
    if (!isPlainObject(value) || isProhibitedObject(value)) {
      return { ok: false, reason: 'prohibited_type' }
    }

    const seen = new WeakSet<object>()
    const counter = { nodes: 0 }
    const cloned = cloneJsonValue(value, seen, 0, counter)
    if (!cloned.ok) {
      return cloned
    }
    if (cloned.value === null || typeof cloned.value !== 'object' || Array.isArray(cloned.value)) {
      return { ok: false, reason: 'root_not_object' }
    }
    return { ok: true, snapshot: cloned.value as JsonObject }
  } catch {
    return { ok: false, reason: 'inspection_failed' }
  }
}

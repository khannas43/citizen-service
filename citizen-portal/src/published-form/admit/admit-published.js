import { admitFormDefinition } from '@dg20/form-renderer'
import { admitServiceId, admitVersionNumber } from './admit-service-id.js'
import { cloneJsonSafe } from './clone-json-safe.js'

/** Exact FormDefinition root own enumerable data properties (FB-E3.1). */
export const FORM_DEFINITION_ROOT_KEYS = Object.freeze([
  'serviceId',
  'version',
  'status',
  'jsonSchema',
  'uiSchema',
  'meta',
  'audit',
])

/** Exact published adapter result envelope keys (FB-E3.1). */
export const PUBLISHED_ADAPTER_RESULT_KEYS = Object.freeze([
  'serviceId',
  'version',
  'definition',
])

function getDataOwn(value, key) {
  try {
    if (value === null || typeof value !== 'object') return { ok: false }
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

function ownStringKeys(value) {
  try {
    if (value === null || typeof value !== 'object') return null
    const keys = Reflect.ownKeys(value)
    const out = []
    for (const key of keys) {
      if (typeof key === 'symbol') return null
      out.push(key)
    }
    return out
  } catch {
    return null
  }
}

function exactKeySet(keys, required) {
  if (keys === null || keys.length !== required.length) return false
  const requiredSet = new Set(required)
  const seen = new Set()
  for (const key of keys) {
    if (!requiredSet.has(key) || seen.has(key)) return false
    seen.add(key)
  }
  for (const key of required) {
    if (!seen.has(key)) return false
  }
  return true
}

/**
 * Require exact own enumerable data keys — no symbols, accessors, or extras.
 */
function admitExactEnumerableDataKeys(value, requiredKeys) {
  const keys = ownStringKeys(value)
  if (!exactKeySet(keys, requiredKeys)) return { ok: false }
  for (const key of requiredKeys) {
    if (!getDataOwn(value, key).ok) return { ok: false }
  }
  return { ok: true, keys }
}

function rehydratePlainJson(value) {
  try {
    return { ok: true, value: JSON.parse(JSON.stringify(value)) }
  } catch {
    return { ok: false }
  }
}

/**
 * Admit a published FormDefinition root for the requested serviceId.
 * Clones before inspection; ignores any ETag (caller must not pass it here).
 * Exact root keys only — no silent repair.
 */
export function admitPublishedLatestResponse(rawBody, expectedServiceId) {
  const cloned = cloneJsonSafe(rawBody)
  if (!cloned.ok) return { ok: false, reason: 'unsafe' }

  const body = cloned.value
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'unsafe' }
  }

  if (!admitExactEnumerableDataKeys(body, FORM_DEFINITION_ROOT_KEYS).ok) {
    return { ok: false, reason: 'unsafe' }
  }

  const serviceIdRaw = getDataOwn(body, 'serviceId')
  const versionRaw = getDataOwn(body, 'version')
  const statusRaw = getDataOwn(body, 'status')
  if (!serviceIdRaw.ok || !versionRaw.ok || !statusRaw.ok) {
    return { ok: false, reason: 'unsafe' }
  }

  const serviceId = admitServiceId(serviceIdRaw.value)
  const version = admitVersionNumber(versionRaw.value)
  if (!serviceId.ok || !version.ok) return { ok: false, reason: 'unsafe' }
  if (serviceId.serviceId !== expectedServiceId) return { ok: false, reason: 'coordinate_mismatch' }
  if (statusRaw.value !== 'published') return { ok: false, reason: 'not_published' }

  const citizen = admitFormDefinition(body, { mode: 'citizen' })
  if (!citizen.ok) return { ok: false, reason: 'renderer_rejected' }

  // Rehydrate to Object.prototype JSON objects for RJSF (clone uses null-proto maps).
  // Progressive plan is derived internally by FormRenderer — never retained on the snapshot.
  const definition = rehydratePlainJson(citizen.definition)
  if (!definition.ok) return { ok: false, reason: 'unsafe' }

  return {
    ok: true,
    snapshot: {
      serviceId: serviceId.serviceId,
      version: version.version,
      definition: definition.value,
    },
  }
}

/**
 * Admit the canonical published adapter result envelope:
 * exact { serviceId, version, definition } after clone-before-inspection.
 * Bare FormDefinition and envelopes carrying `plan` or extras are rejected.
 */
export function admitPublishedAdapterResult(raw, expectedServiceId) {
  const cloned = cloneJsonSafe(raw)
  if (!cloned.ok) return { ok: false, reason: 'unsafe' }

  const value = cloned.value
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'unsafe' }
  }

  if (!admitExactEnumerableDataKeys(value, PUBLISHED_ADAPTER_RESULT_KEYS).ok) {
    return { ok: false, reason: 'unsafe' }
  }

  const serviceIdRaw = getDataOwn(value, 'serviceId')
  const versionRaw = getDataOwn(value, 'version')
  const defRaw = getDataOwn(value, 'definition')
  if (!serviceIdRaw.ok || !versionRaw.ok || !defRaw.ok) {
    return { ok: false, reason: 'unsafe' }
  }

  const serviceId = admitServiceId(serviceIdRaw.value)
  const version = admitVersionNumber(versionRaw.value)
  if (!serviceId.ok || !version.ok) return { ok: false, reason: 'unsafe' }
  if (serviceId.serviceId !== expectedServiceId) {
    return { ok: false, reason: 'coordinate_mismatch' }
  }

  const defAdmit = admitPublishedLatestResponse(defRaw.value, expectedServiceId)
  if (!defAdmit.ok) return defAdmit

  if (defAdmit.snapshot.serviceId !== serviceId.serviceId) {
    return { ok: false, reason: 'coordinate_mismatch' }
  }
  if (defAdmit.snapshot.version !== version.version) {
    return { ok: false, reason: 'coordinate_mismatch' }
  }

  return {
    ok: true,
    snapshot: {
      serviceId: serviceId.serviceId,
      version: version.version,
      definition: defAdmit.snapshot.definition,
    },
  }
}

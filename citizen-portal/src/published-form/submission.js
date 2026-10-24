import { cloneJsonSafe } from './admit/clone-json-safe.js'
import { admitServiceId, admitVersionNumber } from './admit/admit-service-id.js'
import { isAbortError, PublishedFormError, PUBLISHED_FORM_ERROR_CODES } from './errors.js'

/** Exact successful submission result keys (FB-E3.1). */
export const SUBMISSION_SUCCESS_KEYS = Object.freeze(['ok'])

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

/**
 * Only successful CitizenFormSubmissionAdapter result: exact `{ ok: true }`.
 * Clone-before-inspection; never retains or exposes the raw adapter payload.
 */
export function admitSubmissionResult(raw) {
  const cloned = cloneJsonSafe(raw)
  if (!cloned.ok) return { ok: false, reason: 'unsafe' }

  const value = cloned.value
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'unsafe' }
  }

  const keys = ownStringKeys(value)
  if (keys === null || keys.length !== 1 || keys[0] !== 'ok') {
    return { ok: false, reason: 'unsafe' }
  }

  const okField = getDataOwn(value, 'ok')
  if (!okField.ok || okField.value !== true) {
    return { ok: false, reason: 'unsafe' }
  }

  return { ok: true, value: { ok: true } }
}

/**
 * Optional citizen submission port — not wired by default.
 * @typedef {object} CitizenFormSubmissionAdapter
 * @property {(args: { serviceId: string, formVersion: number, formData: object, signal: AbortSignal }) => Promise<{ ok: true }>} submitApplication
 */

/**
 * Detach and admit formData before invoking an injected submission adapter.
 * Admits the adapter result as exact `{ ok: true }` only.
 */
export async function submitWithDetachedFormData(adapter, args) {
  const serviceId = admitServiceId(args.serviceId)
  const version = admitVersionNumber(args.formVersion)
  if (!serviceId.ok || !version.ok) {
    throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.INVALID_SERVICE_ID)
  }
  const cloned = cloneJsonSafe(args.formData ?? {})
  if (!cloned.ok) {
    throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.UNSAFE)
  }
  let rawResult
  try {
    rawResult = await adapter.submitApplication({
      serviceId: serviceId.serviceId,
      formVersion: version.version,
      formData: cloned.value,
      signal: args.signal,
    })
  } catch (error) {
    if (isAbortError(error) || args.signal?.aborted) throw error
    throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.FAILED)
  }
  const admitted = admitSubmissionResult(rawResult)
  if (!admitted.ok) {
    throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.FAILED)
  }
  return admitted.value
}

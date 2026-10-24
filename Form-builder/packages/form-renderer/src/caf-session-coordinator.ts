import type {
  CafPrefillAdapter,
  CafPrefillRequest,
  CafPrefillResolveResult,
} from '@dg20/form-widgets'

import { createAutosaveSnapshot } from './progressive-autosave.js'

/**
 * Session-scoped CAF prefill coordinator (FB-B5 / B5.1).
 *
 * Wraps the host-provided `services.cafPrefill` adapter with a per-FormRenderer
 * session cache of **settled** results. Unresolved requests are
 * lifecycle-isolated (no cross-caller in-flight coalescing) so repeater
 * reindex cannot join an aborted row’s pending host call.
 *
 * Hosts retain identity, auth, HTTP, and Golden Record access. This package
 * never performs CAF HTTP or browser storage.
 */

export type CafPrefillAdmissionFailureReason =
  'not_object' | 'snapshot_failed' | 'unexpected_property' | 'invalid_shape' | 'inspection_failed'

export type CafPrefillAdmissionResult =
  | { readonly ok: true; readonly result: CafPrefillResolveResult }
  | { readonly ok: false; readonly reason: CafPrefillAdmissionFailureReason }

const FOUND_FALSE_KEYS = ['found'] as const
const FOUND_VALUE_KEYS = ['value', 'confidence'] as const

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record)
  if (keys.length !== allowed.length) {
    return false
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      return false
    }
  }
  return true
}

function abortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError')
  }
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

function detachResult(result: CafPrefillResolveResult): CafPrefillResolveResult {
  if ('found' in result) {
    return { found: false }
  }
  return { value: result.value, confidence: result.confidence }
}

/**
 * Instance IDs with numeric array segments (`[n]`) are not durably cached:
 * row removal/reindex reuses the same `[n]` string for a different logical row.
 * Unresolved requests are never coalesced — StrictMode duplication is prevented
 * by CafPrefillWidget microtask deferral.
 */
function allowsDurableCache(instanceFieldId: string): boolean {
  return !/\[\d+]/.test(instanceFieldId)
}

/**
 * Admits a host CAF adapter result through the hardened snapshot boundary.
 * Never invokes getters; never throws.
 */
export function admitCafPrefillAdapterResult(result: unknown): CafPrefillAdmissionResult {
  try {
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
      return { ok: false, reason: 'not_object' }
    }

    const snap = createAutosaveSnapshot(result)
    if (!snap.ok) {
      if (snap.reason === 'unexpected_property') {
        return { ok: false, reason: 'unexpected_property' }
      }
      if (snap.reason === 'inspection_failed') {
        return { ok: false, reason: 'inspection_failed' }
      }
      return { ok: false, reason: 'snapshot_failed' }
    }

    const detached = snap.snapshot as Record<string, unknown>

    if (exactKeys(detached, FOUND_FALSE_KEYS) && detached.found === false) {
      return { ok: true, result: { found: false } }
    }

    if (exactKeys(detached, FOUND_VALUE_KEYS)) {
      const value = detached.value
      const confidence = detached.confidence
      if (typeof value !== 'string') {
        return { ok: false, reason: 'invalid_shape' }
      }
      if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
        return { ok: false, reason: 'invalid_shape' }
      }
      return { ok: true, result: { value, confidence } }
    }

    return { ok: false, reason: 'unexpected_property' }
  } catch {
    return { ok: false, reason: 'inspection_failed' }
  }
}

export interface CafSessionCoordinator extends CafPrefillAdapter {
  /** Drops the session cache, aborts active host calls, and rejects further work. */
  dispose(): void
  /** Test aid — settled cache size only; never exposes keys or values. */
  readonly settledEntryCount: number
  /** Test aid — number of active host-facing AbortControllers. */
  readonly activeRequestCount: number
}

/**
 * Creates a session-scoped coordinator around a host CAF adapter.
 * Settled cache keys: instanceFieldId → cafAttribute → detached result.
 * Each unresolved resolvePrefill owns an isolated AbortController.
 */
export function createCafSessionCoordinator(host: CafPrefillAdapter): CafSessionCoordinator {
  let disposed = false
  /** instanceFieldId → cafAttribute → detached admitted result */
  const byInstance = new Map<string, Map<string, CafPrefillResolveResult>>()
  /** Live host-facing controllers owned by this coordinator. */
  const activeControllers = new Set<AbortController>()

  function readCache(
    instanceFieldId: string,
    cafAttribute: string,
  ): CafPrefillResolveResult | undefined {
    return byInstance.get(instanceFieldId)?.get(cafAttribute)
  }

  function writeCache(
    instanceFieldId: string,
    cafAttribute: string,
    result: CafPrefillResolveResult,
  ): void {
    if (disposed || !allowsDurableCache(instanceFieldId)) {
      return
    }
    let byAttribute = byInstance.get(instanceFieldId)
    if (!byAttribute) {
      byAttribute = new Map()
      byInstance.set(instanceFieldId, byAttribute)
    }
    byAttribute.set(cafAttribute, detachResult(result))
  }

  function assertStillLive(callerSignal: AbortSignal, internal: AbortController): void {
    if (disposed || callerSignal.aborted || internal.signal.aborted) {
      throw abortError()
    }
  }

  const coordinator: CafSessionCoordinator = {
    get settledEntryCount() {
      let count = 0
      for (const byAttribute of byInstance.values()) {
        count += byAttribute.size
      }
      return count
    },

    get activeRequestCount() {
      return activeControllers.size
    },

    dispose() {
      disposed = true
      byInstance.clear()
      for (const controller of activeControllers) {
        controller.abort()
      }
      activeControllers.clear()
    },

    async resolvePrefill(request: CafPrefillRequest): Promise<CafPrefillResolveResult> {
      if (disposed || request.signal.aborted) {
        throw abortError()
      }

      const cached = readCache(request.fieldId, request.cafAttribute)
      if (cached) {
        if (request.signal.aborted || disposed) {
          throw abortError()
        }
        return detachResult(cached)
      }

      const internal = new AbortController()
      activeControllers.add(internal)

      const onCallerAbort = () => {
        internal.abort()
      }
      request.signal.addEventListener('abort', onCallerAbort)

      try {
        // Caller may have aborted between the initial check and listener attach.
        if (request.signal.aborted) {
          internal.abort()
          throw abortError()
        }

        let raw: unknown
        try {
          raw = await host.resolvePrefill({
            fieldId: request.fieldId,
            cafAttribute: request.cafAttribute,
            signal: internal.signal,
          })
        } catch (error) {
          assertStillLive(request.signal, internal)
          throw error
        }

        // Hosts may ignore AbortSignal — recheck before any admission/cache write.
        assertStillLive(request.signal, internal)

        const admitted = admitCafPrefillAdapterResult(raw)
        if (!admitted.ok) {
          throw new Error('CAF prefill result was rejected')
        }

        // Recheck immediately before cache mutation.
        assertStillLive(request.signal, internal)
        writeCache(request.fieldId, request.cafAttribute, admitted.result)
        return detachResult(admitted.result)
      } finally {
        request.signal.removeEventListener('abort', onCallerAbort)
        activeControllers.delete(internal)
      }
    },
  }

  return coordinator
}

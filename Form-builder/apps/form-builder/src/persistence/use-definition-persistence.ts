import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react'

import type { FormDefinition } from '@dg20/form-contract'

import type { AuthoringAction, AuthoringUiState } from '../authoring/index.js'
import { definitionsSemanticallyEqual } from '../validation/definitions-semantically-equal.js'
import { isAuthoringInteractionBlocked } from '../validation/is-authoring-interaction-blocked.js'
import type { DefinitionValidationViewState } from '../validation/use-definition-validation.js'
import { admitDraftCoordinates } from './admit-draft-coordinates.js'
import { admitPersistencePortResult } from './admit-persistence-response.js'
import {
  DraftPersistenceError,
  type FormDefinitionDraftPersistenceAdapter,
} from './form-definition-draft-persistence-adapter.js'
import { preparePersistenceRequest } from './prepare-persistence-request.js'

export type DefinitionPersistencePhase =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'duplicate'
  | 'stale'
  | 'not_found'
  | 'discarded'

export type PersistenceOperation = 'create' | 'load' | 'replace'

export type PersistenceFailureSurface = 'save' | 'load' | 'none'

export type PersistenceBinding =
  | { readonly kind: 'local' }
  | {
      readonly kind: 'persisted'
      readonly serviceId: string
      readonly version: number
      readonly etag: string
      readonly baseline: FormDefinition
    }

export interface DefinitionPersistenceViewState {
  readonly phase: DefinitionPersistencePhase
  readonly binding: PersistenceBinding
  readonly definitionDirty: boolean
  readonly canSave: boolean
  readonly canLoad: boolean
  readonly loadBlockedNeedsDiscard: boolean
  readonly showDiscardConfirmation: boolean
  readonly saveBusy: boolean
  readonly loadBusy: boolean
  readonly lastSuccessKind: 'created' | 'loaded' | 'saved' | null
  readonly currentOperation: PersistenceOperation | null
  readonly failureSurface: PersistenceFailureSurface
  readonly loadRetryable: boolean
  readonly coordinateGuidance: boolean
}

export interface UseDefinitionPersistenceArgs {
  readonly definition: FormDefinition
  readonly uiState: AuthoringUiState
  readonly dispatch: Dispatch<AuthoringAction>
  readonly validation: DefinitionValidationViewState
  readonly adapter: FormDefinitionDraftPersistenceAdapter | null
  /**
   * Monotonic counter bumped synchronously on authoring mutations that must
   * discard an in-flight exact load (FB-D7 / D7.1).
   */
  readonly sessionEpochRef: { current: number }
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function mapPersistenceFailure(error: unknown): DefinitionPersistencePhase {
  if (error instanceof DraftPersistenceError) {
    if (error.code === 'duplicate') return 'duplicate'
    if (error.code === 'stale') return 'stale'
    if (error.code === 'not_found') return 'not_found'
    if (error.code === 'not_editable') return 'failed'
    if (error.code === 'validation_rejected') return 'failed'
    if (error.code === 'response_rejected') return 'failed'
    if (error.code === 'invalid_coordinates') return 'failed'
    return 'failed'
  }
  return 'failed'
}

function computeDefinitionDirty(definition: FormDefinition, binding: PersistenceBinding): boolean {
  if (binding.kind === 'local') {
    return true
  }
  return !definitionsSemanticallyEqual(definition, binding.baseline)
}

function bindingCoordinatesMatch(definition: FormDefinition, binding: PersistenceBinding): boolean {
  if (binding.kind === 'local') {
    return true
  }
  return definition.serviceId === binding.serviceId && definition.version === binding.version
}

function sessionNeedsDiscardConfirmation(
  definitionDirty: boolean,
  binding: PersistenceBinding,
  uiState: AuthoringUiState,
  phase: DefinitionPersistencePhase,
): boolean {
  if (phase === 'stale') {
    return true
  }
  if (isAuthoringInteractionBlocked(uiState)) {
    return true
  }
  if (binding.kind === 'local') {
    return true
  }
  return definitionDirty
}

function toPersistedBinding(
  definition: FormDefinition,
  etag: string,
): Extract<PersistenceBinding, { kind: 'persisted' }> {
  return {
    kind: 'persisted',
    serviceId: definition.serviceId,
    version: definition.version,
    etag,
    baseline: definition,
  }
}

/**
 * Builder draft create / exact load / optimistic replace coordinator (FB-D7 / D7.1).
 * ETag and baseline live outside FormDefinition and previewFormData.
 * Injected adapter results are re-admitted before any state mutation.
 */
export function useDefinitionPersistence({
  definition,
  uiState,
  dispatch,
  validation,
  adapter,
  sessionEpochRef,
}: UseDefinitionPersistenceArgs): {
  readonly view: DefinitionPersistenceViewState
  readonly saveDraft: () => void
  readonly requestLoad: (serviceId: string, versionText: string) => void
  readonly confirmDiscardAndLoad: () => void
  readonly cancelDiscardConfirmation: () => void
  readonly retryLastFailure: () => void
  readonly adoptPersistedSnapshot: (definition: FormDefinition, etag: string) => void
  readonly summaryRef: RefObject<HTMLDivElement | null>
} {
  const [phase, setPhase] = useState<DefinitionPersistencePhase>('idle')
  const [binding, setBinding] = useState<PersistenceBinding>({ kind: 'local' })
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false)
  const [lastSuccessKind, setLastSuccessKind] = useState<'created' | 'loaded' | 'saved' | null>(
    null,
  )
  const [currentOperation, setCurrentOperation] = useState<PersistenceOperation | null>(null)
  const [failureSurface, setFailureSurface] = useState<PersistenceFailureSurface>('none')
  const [loadRetryable, setLoadRetryable] = useState(false)
  const [coordinateGuidance, setCoordinateGuidance] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const summaryRef = useRef<HTMLDivElement | null>(null)

  const requestSeq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const adapterRef = useRef(adapter)
  const definitionRef = useRef(definition)
  const uiStateRef = useRef(uiState)
  const bindingRef = useRef(binding)
  const phaseRef = useRef(phase)
  const pendingLoadRef = useRef<{ serviceId: string; version: number } | null>(null)
  const lastLoadFailureRef = useRef<{ serviceId: string; version: number } | null>(null)
  const failureSurfaceRef = useRef(failureSurface)
  const loadRetryableRef = useRef(loadRetryable)

  definitionRef.current = definition
  uiStateRef.current = uiState
  bindingRef.current = binding
  phaseRef.current = phase
  failureSurfaceRef.current = failureSurface
  loadRetryableRef.current = loadRetryable

  const definitionDirty = computeDefinitionDirty(definition, binding)
  const requestActive = phase === 'loading' || phase === 'saving'
  const blockedByDrafts = isAuthoringInteractionBlocked(uiState)
  const coordinatesAligned = bindingCoordinatesMatch(definition, binding)

  const canSave =
    adapter !== null &&
    !requestActive &&
    !blockedByDrafts &&
    validation.phase === 'valid' &&
    validation.result !== null &&
    validation.result.valid &&
    validation.resultMatchesCurrentDefinition &&
    definition.status === 'draft' &&
    definitionDirty &&
    coordinatesAligned &&
    phase !== 'stale' &&
    phase !== 'discarded'

  const canLoad = adapter !== null && !requestActive

  const loadBlockedNeedsDiscard = sessionNeedsDiscardConfirmation(
    definitionDirty,
    binding,
    uiState,
    phase,
  )

  const bumpFocus = useCallback(() => {
    setFocusToken((token) => token + 1)
  }, [])

  const clearLoadFailureState = useCallback(() => {
    lastLoadFailureRef.current = null
    setLoadRetryable(false)
    setCoordinateGuidance(false)
  }, [])

  const invalidateInFlight = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
  }, [])

  useEffect(() => {
    if (adapterRef.current !== adapter) {
      adapterRef.current = adapter
      invalidateInFlight()
      setShowDiscardConfirmation(false)
      pendingLoadRef.current = null
      clearLoadFailureState()
      setFailureSurface('none')
      setCurrentOperation(null)
      setPhase('idle')
    }
  }, [adapter, clearLoadFailureState, invalidateInFlight])

  useEffect(() => {
    return () => {
      invalidateInFlight()
    }
  }, [invalidateInFlight])

  useEffect(() => {
    if (focusToken === 0) {
      return
    }
    if (
      phase !== 'failed' &&
      phase !== 'duplicate' &&
      phase !== 'stale' &&
      phase !== 'not_found' &&
      !showDiscardConfirmation
    ) {
      return
    }
    const frame = requestAnimationFrame(() => {
      summaryRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusToken, phase, showDiscardConfirmation])

  const beginLoad = useCallback(
    (serviceId: string, version: number) => {
      const currentAdapter = adapterRef.current
      if (currentAdapter === null) {
        setCurrentOperation('load')
        setFailureSurface('load')
        setLoadRetryable(false)
        setCoordinateGuidance(false)
        setPhase('failed')
        bumpFocus()
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const seq = ++requestSeq.current
      const epochAtStart = sessionEpochRef.current
      setShowDiscardConfirmation(false)
      setCurrentOperation('load')
      setFailureSurface('none')
      setCoordinateGuidance(false)
      setLoadRetryable(false)
      setPhase('loading')

      void (async () => {
        try {
          const raw = await currentAdapter.loadDraft({
            serviceId,
            version,
            signal: controller.signal,
          })
          if (seq !== requestSeq.current || controller.signal.aborted) {
            return
          }
          if (sessionEpochRef.current !== epochAtStart) {
            pendingLoadRef.current = null
            setPhase('discarded')
            setCurrentOperation('load')
            setFailureSurface('none')
            setLoadRetryable(false)
            return
          }

          const admitted = admitPersistencePortResult({
            raw,
            expectedServiceId: serviceId,
            expectedVersion: version,
          })
          if (seq !== requestSeq.current || controller.signal.aborted) {
            return
          }
          if (sessionEpochRef.current !== epochAtStart) {
            pendingLoadRef.current = null
            setPhase('discarded')
            setCurrentOperation('load')
            setFailureSurface('none')
            setLoadRetryable(false)
            return
          }
          if (!admitted.ok) {
            lastLoadFailureRef.current = { serviceId, version }
            setFailureSurface('load')
            setLoadRetryable(true)
            setCoordinateGuidance(false)
            setPhase('failed')
            bumpFocus()
            return
          }

          dispatch({
            type: 'replaceAuthoringSession',
            definition: admitted.definition,
            previewPolicy: 'clear',
          })
          setBinding(toPersistedBinding(admitted.definition, admitted.etag))
          pendingLoadRef.current = null
          clearLoadFailureState()
          setFailureSurface('none')
          setLastSuccessKind('loaded')
          setPhase('saved')
        } catch (error) {
          if (seq !== requestSeq.current || controller.signal.aborted || isAbortError(error)) {
            return
          }
          if (sessionEpochRef.current !== epochAtStart) {
            pendingLoadRef.current = null
            setPhase('discarded')
            setCurrentOperation('load')
            setFailureSurface('none')
            setLoadRetryable(false)
            return
          }
          const nextPhase = mapPersistenceFailure(error)
          lastLoadFailureRef.current = { serviceId, version }
          setFailureSurface('load')
          setLoadRetryable(true)
          setCoordinateGuidance(false)
          setPhase(nextPhase === 'not_found' ? 'not_found' : 'failed')
          bumpFocus()
        }
      })()
    },
    // sessionEpochRef is a stable mutable box; reading .current must not re-create beginLoad.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref identity is stable
    [bumpFocus, clearLoadFailureState, dispatch],
  )

  const requestLoadAdmitted = useCallback(
    (serviceId: string, version: number) => {
      if (!canLoad) {
        return
      }
      pendingLoadRef.current = { serviceId, version }
      setCoordinateGuidance(false)
      if (
        sessionNeedsDiscardConfirmation(
          computeDefinitionDirty(definitionRef.current, bindingRef.current),
          bindingRef.current,
          uiStateRef.current,
          phaseRef.current,
        )
      ) {
        setShowDiscardConfirmation(true)
        bumpFocus()
        return
      }
      beginLoad(serviceId, version)
    },
    [beginLoad, bumpFocus, canLoad],
  )

  const saveDraft = useCallback(() => {
    if (!canSave) {
      return
    }
    if (phaseRef.current === 'saving' || phaseRef.current === 'loading') {
      return
    }
    const currentAdapter = adapterRef.current
    if (currentAdapter === null) {
      return
    }

    const prepared = preparePersistenceRequest(definitionRef.current)
    if (!prepared.ok) {
      setCurrentOperation(bindingRef.current.kind === 'local' ? 'create' : 'replace')
      setFailureSurface('save')
      setLoadRetryable(false)
      setCoordinateGuidance(false)
      setPhase('failed')
      bumpFocus()
      return
    }

    const sentSnapshot = prepared.definition
    const currentBinding = bindingRef.current
    const creating = currentBinding.kind === 'local'
    const operation: PersistenceOperation = creating ? 'create' : 'replace'

    if (
      currentBinding.kind === 'persisted' &&
      (sentSnapshot.serviceId !== currentBinding.serviceId ||
        sentSnapshot.version !== currentBinding.version)
    ) {
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    setCurrentOperation(operation)
    setFailureSurface('none')
    setCoordinateGuidance(false)
    setLoadRetryable(false)
    setPhase('saving')

    void (async () => {
      try {
        let raw: unknown
        if (creating) {
          raw = await currentAdapter.createDraft({
            definition: sentSnapshot,
            signal: controller.signal,
          })
        } else if (currentBinding.kind === 'persisted') {
          raw = await currentAdapter.replaceDraft({
            serviceId: sentSnapshot.serviceId,
            version: sentSnapshot.version,
            etag: currentBinding.etag,
            definition: sentSnapshot,
            signal: controller.signal,
          })
        } else {
          setFailureSurface('save')
          setPhase('failed')
          bumpFocus()
          return
        }

        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }

        const admitted = admitPersistencePortResult({
          raw,
          expectedServiceId: sentSnapshot.serviceId,
          expectedVersion: sentSnapshot.version,
        })
        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }
        if (!admitted.ok) {
          setFailureSurface('save')
          setLoadRetryable(false)
          setPhase('failed')
          bumpFocus()
          return
        }

        const current = definitionRef.current
        if (
          current.serviceId !== sentSnapshot.serviceId ||
          current.version !== sentSnapshot.version
        ) {
          pendingLoadRef.current = null
          setFailureSurface('none')
          setLoadRetryable(false)
          setPhase('discarded')
          return
        }

        const draftsNow = isAuthoringInteractionBlocked(uiStateRef.current)
        const committedEqualsSent = definitionsSemanticallyEqual(current, sentSnapshot)

        setBinding(toPersistedBinding(admitted.definition, admitted.etag))

        if (committedEqualsSent && !draftsNow) {
          dispatch({
            type: 'replaceAuthoringSession',
            definition: admitted.definition,
            previewPolicy: 'preserve',
          })
        }

        setLastSuccessKind(creating ? 'created' : 'saved')
        setFailureSurface('none')
        setPhase('saved')
      } catch (error) {
        if (seq !== requestSeq.current || controller.signal.aborted || isAbortError(error)) {
          return
        }
        const nextPhase = mapPersistenceFailure(error)
        setFailureSurface('save')
        setLoadRetryable(false)
        setPhase(nextPhase)
        bumpFocus()
      }
    })()
  }, [bumpFocus, canSave, dispatch])

  const requestLoad = useCallback(
    (serviceIdRaw: string, versionText: string) => {
      if (!canLoad) {
        return
      }
      const admitted = admitDraftCoordinates(serviceIdRaw, versionText)
      if (!admitted.ok) {
        pendingLoadRef.current = null
        lastLoadFailureRef.current = null
        setShowDiscardConfirmation(false)
        setCurrentOperation('load')
        setFailureSurface('load')
        setLoadRetryable(false)
        setCoordinateGuidance(true)
        setPhase('failed')
        bumpFocus()
        return
      }
      setCoordinateGuidance(false)
      requestLoadAdmitted(admitted.serviceId, admitted.version)
    },
    [bumpFocus, canLoad, requestLoadAdmitted],
  )

  const confirmDiscardAndLoad = useCallback(() => {
    const pending = pendingLoadRef.current
    if (pending === null) {
      setShowDiscardConfirmation(false)
      return
    }
    beginLoad(pending.serviceId, pending.version)
  }, [beginLoad])

  const cancelDiscardConfirmation = useCallback(() => {
    setShowDiscardConfirmation(false)
    pendingLoadRef.current = null
  }, [])

  const retryLastFailure = useCallback(() => {
    if (failureSurfaceRef.current !== 'load' || !loadRetryableRef.current) {
      return
    }
    const last = lastLoadFailureRef.current
    if (last === null) {
      return
    }
    // Re-enter the same Load decision path (including discard confirmation).
    // Never call beginLoad directly.
    requestLoad(last.serviceId, String(last.version))
  }, [requestLoad])

  const adoptPersistedSnapshot = useCallback(
    (nextDefinition: FormDefinition, etag: string) => {
      invalidateInFlight()
      pendingLoadRef.current = null
      clearLoadFailureState()
      setShowDiscardConfirmation(false)
      setBinding(toPersistedBinding(nextDefinition, etag))
      setCurrentOperation(null)
      setFailureSurface('none')
      setPhase('saved')
    },
    [clearLoadFailureState, invalidateInFlight],
  )

  return {
    view: {
      phase,
      binding,
      definitionDirty,
      canSave,
      canLoad,
      loadBlockedNeedsDiscard,
      showDiscardConfirmation,
      saveBusy: phase === 'saving',
      loadBusy: phase === 'loading',
      lastSuccessKind,
      currentOperation,
      failureSurface,
      loadRetryable,
      coordinateGuidance,
    },
    saveDraft,
    requestLoad,
    confirmDiscardAndLoad,
    cancelDiscardConfirmation,
    retryLastFailure,
    adoptPersistedSnapshot,
    summaryRef,
  }
}

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react'

import type { FormDefinition } from '@citizen/form-contract'

import type { AuthoringAction, AuthoringUiState } from '../authoring/index.js'
import { definitionsSemanticallyEqual } from '../validation/definitions-semantically-equal.js'
import { isAuthoringInteractionBlocked } from '../validation/is-authoring-interaction-blocked.js'
import type { DefinitionValidationViewState } from '../validation/use-definition-validation.js'
import type { DefinitionPersistenceViewState } from '../persistence/use-definition-persistence.js'
import { admitActorId } from './admit-actor-id.js'
import { admitLifecyclePortResult } from './admit-lifecycle-response.js'
import {
  LifecycleError,
  type FormDefinitionLifecycleAdapter,
  type LifecycleSnapshot,
} from './form-definition-lifecycle-adapter.js'

export type DefinitionLifecyclePhase =
  'idle' | 'confirming' | 'submitting' | 'submitted' | 'failed' | 'stale' | 'discarded'

export interface UseDefinitionLifecycleArgs {
  readonly definition: FormDefinition
  readonly uiState: AuthoringUiState
  readonly dispatch: Dispatch<AuthoringAction>
  readonly validation: DefinitionValidationViewState
  readonly persistence: DefinitionPersistenceViewState
  readonly adapter: FormDefinitionLifecycleAdapter | null
  readonly actorId: string | null
  readonly sessionEpochRef: { current: number }
  readonly onAdoptSubmitted: (snapshot: LifecycleSnapshot) => void
}

export function computeCanSubmit(
  args: Omit<UseDefinitionLifecycleArgs, 'dispatch' | 'sessionEpochRef' | 'onAdoptSubmitted'> & {
    readonly phase: DefinitionLifecyclePhase
  },
): boolean {
  const { definition, uiState, validation, persistence, adapter, phase } = args
  const binding = persistence.binding
  return (
    adapter !== null &&
    definition.status === 'draft' &&
    binding.kind === 'persisted' &&
    definition.serviceId === binding.serviceId &&
    definition.version === binding.version &&
    !persistence.definitionDirty &&
    !isAuthoringInteractionBlocked(uiState) &&
    validation.phase === 'valid' &&
    validation.result !== null &&
    validation.result.valid &&
    validation.resultMatchesCurrentDefinition &&
    !persistence.saveBusy &&
    !persistence.loadBusy &&
    !['stale', 'discarded', 'failed', 'loading', 'saving'].includes(persistence.phase) &&
    phase !== 'submitting'
  )
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

/** Coordinates the submit lifecycle without exposing credentials or snapshots in UI state. */
export function useDefinitionLifecycle({
  definition,
  uiState,
  dispatch: _dispatch,
  validation,
  persistence,
  adapter,
  actorId,
  sessionEpochRef,
  onAdoptSubmitted,
}: UseDefinitionLifecycleArgs): {
  readonly view: {
    readonly phase: DefinitionLifecyclePhase
    readonly canSubmit: boolean
    readonly submitBusy: boolean
    readonly showConfirmation: boolean
    readonly advisoryWarningCount: number
    readonly advisoryInfoCount: number
    readonly canRetry: boolean
    readonly missingActorGuidance: boolean
  }
  readonly requestSubmit: () => void
  readonly confirmSubmit: () => void
  readonly cancelConfirmation: () => void
  readonly retryLastFailure: () => void
  readonly summaryRef: RefObject<HTMLDivElement | null>
} {
  const [phase, setPhase] = useState<DefinitionLifecyclePhase>('idle')
  const summaryRef = useRef<HTMLDivElement | null>(null)
  const requestSeq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef<{ readonly definition: FormDefinition; readonly etag: string } | null>(
    null,
  )
  const definitionRef = useRef(definition)
  const adapterRef = useRef(adapter)
  const actorRef = useRef(actorId)
  const canSubmit = computeCanSubmit({
    definition,
    uiState,
    validation,
    persistence,
    adapter,
    actorId,
    phase,
  })
  definitionRef.current = definition

  const invalidate = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    inFlightRef.current = null
    requestSeq.current += 1
  }, [])

  useEffect(() => {
    if (adapterRef.current !== adapter || actorRef.current !== actorId) {
      adapterRef.current = adapter
      actorRef.current = actorId
      invalidate()
      setPhase('idle')
    }
  }, [adapter, actorId, invalidate])

  useEffect(() => {
    const inFlight = inFlightRef.current
    if (phase !== 'submitting' || inFlight === null) return
    const binding = persistence.binding
    if (
      !definitionsSemanticallyEqual(inFlight.definition, definition) ||
      binding.kind !== 'persisted' ||
      binding.etag !== inFlight.etag ||
      binding.serviceId !== inFlight.definition.serviceId ||
      binding.version !== inFlight.definition.version
    ) {
      invalidate()
      inFlightRef.current = null
      setPhase('discarded')
    }
  }, [definition, invalidate, persistence.binding, phase])

  useEffect(() => {
    return () => invalidate()
  }, [invalidate])

  useEffect(() => {
    if ((phase === 'confirming' || phase === 'failed' || phase === 'stale') && !canSubmit) {
      if (phase === 'confirming') {
        setPhase('idle')
      }
    }
  }, [canSubmit, phase])

  const requestSubmit = useCallback(() => {
    if (canSubmit) setPhase('confirming')
  }, [canSubmit])

  const cancelConfirmation = useCallback(() => {
    if (phase !== 'submitting') setPhase('idle')
  }, [phase])

  const confirmSubmit = useCallback(() => {
    if (phase !== 'confirming' || !canSubmit) return
    const currentAdapter = adapterRef.current
    const binding = persistence.binding
    const admittedActor =
      actorRef.current === null ? { ok: false as const } : admitActorId(actorRef.current)
    if (currentAdapter === null || binding.kind !== 'persisted') return
    const sent = definitionRef.current
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    const seq = ++requestSeq.current
    const epoch = sessionEpochRef.current
    inFlightRef.current = { definition: sent, etag: binding.etag }
    setPhase('submitting')
    void (async () => {
      try {
        const raw = await currentAdapter.submitDraft({
          serviceId: sent.serviceId,
          version: sent.version,
          etag: binding.etag,
          ...(admittedActor.ok ? { actorId: admittedActor.actorId } : {}),
          signal: controller.signal,
        })
        if (seq !== requestSeq.current || controller.signal.aborted) return
        if (
          sessionEpochRef.current !== epoch ||
          !definitionsSemanticallyEqual(sent, definitionRef.current)
        ) {
          setPhase('discarded')
          inFlightRef.current = null
          return
        }
        const admitted = admitLifecyclePortResult({
          raw,
          expectedServiceId: sent.serviceId,
          expectedVersion: sent.version,
        })
        if (!admitted.ok) {
          setPhase('failed')
          inFlightRef.current = null
          return
        }
        // Clear before adoption so the submitting-guard effect cannot treat the
        // successful definition replace as a mid-flight discard (FB-D18).
        inFlightRef.current = null
        onAdoptSubmitted(admitted)
        setPhase('submitted')
      } catch (error) {
        if (seq !== requestSeq.current || controller.signal.aborted || isAbortError(error)) return
        inFlightRef.current = null
        setPhase(
          error instanceof LifecycleError && error.code === 'stale_revision' ? 'stale' : 'failed',
        )
      }
    })()
  }, [canSubmit, onAdoptSubmitted, persistence.binding, phase, sessionEpochRef])

  const retryLastFailure = useCallback(() => {
    if (phase === 'failed' || phase === 'stale' || phase === 'discarded') {
      if (canSubmit) setPhase('confirming')
    }
  }, [canSubmit, phase])

  const result = validation.phase === 'valid' && validation.result?.valid ? validation.result : null
  return {
    view: {
      phase,
      canSubmit,
      submitBusy: phase === 'submitting',
      showConfirmation: phase === 'confirming',
      advisoryWarningCount:
        result?.issues.filter((issue) => issue.severity === 'warning').length ?? 0,
      advisoryInfoCount: result?.issues.filter((issue) => issue.severity === 'info').length ?? 0,
      canRetry: (phase === 'failed' || phase === 'stale' || phase === 'discarded') && canSubmit,
      missingActorGuidance: false,
    },
    requestSubmit,
    confirmSubmit,
    cancelConfirmation,
    retryLastFailure,
    summaryRef,
  }
}

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import type { FormDefinition, ValidationResult } from '@citizen/form-contract'

import type { AuthoringUiState } from '../authoring/index.js'
import { admitValidationResult } from './admit-validation-result.js'
import { definitionsSemanticallyEqual } from './definitions-semantically-equal.js'
import type { FormDefinitionValidationAdapter } from './form-definition-validation-adapter.js'
import { hasAnyUnsavedAuthoringDraft } from './has-any-unsaved-authoring-draft.js'
import { isAuthoringInteractionBlocked } from './is-authoring-interaction-blocked.js'
import { prepareValidationRequest } from './prepare-validation-request.js'

export type DefinitionValidationPhase = 'idle' | 'validating' | 'valid' | 'invalid' | 'failed'

export interface DefinitionValidationViewState {
  readonly phase: DefinitionValidationPhase
  readonly result: ValidationResult | null
  readonly blockedByUnsavedDraft: boolean
  readonly canValidate: boolean
  readonly canRetry: boolean
  /**
   * True when the settled validation result was produced for a definition that
   * is still semantically equal to the current committed definition (FB-D7.1).
   * Computed synchronously during render so Save cannot race ahead of reset effects.
   */
  readonly resultMatchesCurrentDefinition: boolean
}

export interface UseDefinitionValidationArgs {
  readonly definition: FormDefinition
  readonly uiState: AuthoringUiState
  readonly adapter: FormDefinitionValidationAdapter | null
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

/**
 * Explicit Form Definition validation state machine (FB-D6 / D6.1 / D7.1).
 * Never validates on mount. One in-flight request. Stale resolves ignored.
 * Deeply equal definition replacements do not abort or clear settled results.
 */
export function useDefinitionValidation({
  definition,
  uiState,
  adapter,
}: UseDefinitionValidationArgs): {
  readonly view: DefinitionValidationViewState
  readonly validate: () => void
  readonly summaryRef: RefObject<HTMLDivElement | null>
} {
  const [phase, setPhase] = useState<DefinitionValidationPhase>('idle')
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [validatedBaseline, setValidatedBaseline] = useState<FormDefinition | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const summaryRef = useRef<HTMLDivElement | null>(null)

  const requestSeq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const adapterRef = useRef(adapter)
  const definitionRef = useRef(definition)
  const phaseRef = useRef(phase)
  const blockedRef = useRef(false)

  const blockedByUnsavedDraft = isAuthoringInteractionBlocked(uiState)
  const hasUnsavedDraft = hasAnyUnsavedAuthoringDraft(uiState)
  blockedRef.current = blockedByUnsavedDraft
  phaseRef.current = phase

  const resultMatchesCurrentDefinition =
    validatedBaseline !== null &&
    (phase === 'valid' || phase === 'invalid') &&
    result !== null &&
    definitionsSemanticallyEqual(validatedBaseline, definition)

  const resetToIdle = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    setPhase('idle')
    setResult(null)
    setValidatedBaseline(null)
  }, [])

  useEffect(() => {
    if (definitionRef.current === definition) {
      return
    }
    if (definitionsSemanticallyEqual(definitionRef.current, definition)) {
      definitionRef.current = definition
      return
    }
    definitionRef.current = definition
    resetToIdle()
  }, [definition, resetToIdle])

  // Property/bilingual drafts invalidate validation. An active canvas reorder
  // gesture blocks Validate without clearing a still-matching result (FB-D20).
  useEffect(() => {
    if (hasUnsavedDraft) {
      resetToIdle()
    }
  }, [hasUnsavedDraft, resetToIdle])

  useEffect(() => {
    if (adapterRef.current !== adapter) {
      adapterRef.current = adapter
      resetToIdle()
    }
  }, [adapter, resetToIdle])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
      requestSeq.current += 1
    }
  }, [])

  useEffect(() => {
    if (focusToken === 0) {
      return
    }
    if (phase !== 'invalid' && phase !== 'failed') {
      return
    }
    const frame = requestAnimationFrame(() => {
      summaryRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusToken, phase])

  const validate = useCallback(() => {
    if (blockedRef.current) {
      return
    }
    if (phaseRef.current === 'validating') {
      return
    }
    const currentAdapter = adapterRef.current
    if (currentAdapter === null) {
      setPhase('failed')
      setResult(null)
      setValidatedBaseline(null)
      setFocusToken((token) => token + 1)
      return
    }

    const prepared = prepareValidationRequest(definitionRef.current)
    if (!prepared.ok) {
      setPhase('failed')
      setResult(null)
      setValidatedBaseline(null)
      setFocusToken((token) => token + 1)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    setPhase('validating')
    setResult(null)
    setValidatedBaseline(null)

    void (async () => {
      try {
        const adapterResult = await currentAdapter.validateDefinition({
          definition: prepared.definition,
          signal: controller.signal,
        })
        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }
        if (!definitionsSemanticallyEqual(prepared.definition, definitionRef.current)) {
          return
        }
        const admitted = admitValidationResult(adapterResult)
        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }
        if (!definitionsSemanticallyEqual(prepared.definition, definitionRef.current)) {
          return
        }
        if (!admitted.ok) {
          setPhase('failed')
          setResult(null)
          setValidatedBaseline(null)
          setFocusToken((token) => token + 1)
          return
        }
        setValidatedBaseline(prepared.definition)
        setResult(admitted.result)
        setPhase(admitted.result.valid ? 'valid' : 'invalid')
        if (!admitted.result.valid) {
          setFocusToken((token) => token + 1)
        }
      } catch (error) {
        if (seq !== requestSeq.current || controller.signal.aborted || isAbortError(error)) {
          return
        }
        setPhase('failed')
        setResult(null)
        setValidatedBaseline(null)
        setFocusToken((token) => token + 1)
      }
    })()
  }, [])

  const canValidate =
    definition.status === 'draft' &&
    !blockedByUnsavedDraft &&
    phase !== 'validating' &&
    adapter !== null
  const canRetry =
    definition.status === 'draft' &&
    phase === 'failed' &&
    !blockedByUnsavedDraft &&
    adapter !== null

  return {
    view: {
      phase,
      result,
      blockedByUnsavedDraft,
      canValidate,
      canRetry,
      resultMatchesCurrentDefinition,
    },
    validate,
    summaryRef,
  }
}

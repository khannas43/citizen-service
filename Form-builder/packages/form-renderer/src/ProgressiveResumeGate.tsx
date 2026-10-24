import { deepEquals } from '@rjsf/utils'
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'

import type { FormDefinition } from '@dg20/form-contract'

import {
  admitProgressiveResumeResult,
  resolveResumeContextRevision,
  type ProgressiveResumeAdapter,
  type ProgressiveResumeStatus,
  type ProgressiveResumeStatusData,
} from './progressive-resume.js'
import type { ProgressiveStepPlan } from './progressive-steps.js'
import { resolveRendererMessage } from './renderer-messages.js'
import type { FormRendererLocale } from './renderer-types.js'

/** Internal UI phase — awaiting_host never appears in public status callbacks. */
type ResumeUiPhase = 'config_invalid' | 'loading' | 'awaiting_host' | 'failed' | 'ready'

export interface ProgressiveResumeCommit {
  readonly formData: Record<string, unknown>
  readonly stepIndex: number
  readonly settlement: Exclude<ProgressiveResumeStatus, 'loading' | 'failed'>
}

interface ResumeFlight {
  seq: number
  controller: AbortController | null
  /** Host baseline at load start — equal clones do not discard. */
  baselineData: Record<string, unknown>
  /** Candidate awaiting controlled echo (detached). */
  candidate: Record<string, unknown> | null
  candidateStepIndex: number
  candidateStepId: string
  /** After loaded/not_found/discarded — adapter identity change must not reload. */
  settled: boolean
}

export interface ProgressiveResumeGateProps {
  readonly definition: FormDefinition
  readonly steps: readonly ProgressiveStepPlan[]
  readonly locale: FormRendererLocale
  readonly formDataProp: Readonly<Record<string, unknown>> | undefined
  readonly formDataControlled: boolean
  readonly onChange?: (data: { readonly formData: Readonly<Record<string, unknown>> }) => void
  readonly resumeAdapter: ProgressiveResumeAdapter
  readonly resumeContextRevision: string | undefined
  readonly onResumeStatusChange?: (data: ProgressiveResumeStatusData) => void
  readonly idPrefix: string
  readonly children: (commit: ProgressiveResumeCommit) => ReactNode
}

function hostBaseline(
  formDataProp: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  return formDataProp ? { ...formDataProp } : {}
}

/**
 * Loads host-owned saved progress before mounting the progressive Form.
 * Never performs HTTP/storage; never mounts RJSF while loading/awaiting.
 */
export function ProgressiveResumeGate({
  definition,
  steps,
  locale,
  formDataProp,
  formDataControlled,
  onChange,
  resumeAdapter,
  resumeContextRevision,
  onResumeStatusChange,
  idPrefix,
  children,
}: ProgressiveResumeGateProps): ReactElement {
  const revisionResolution = resolveResumeContextRevision(resumeContextRevision)
  const revisionOk = revisionResolution.ok
  const revision = revisionResolution.ok ? revisionResolution.revision : ''

  const [phase, setPhase] = useState<ResumeUiPhase>(() =>
    revisionOk ? 'loading' : 'config_invalid',
  )
  const [commit, setCommit] = useState<ProgressiveResumeCommit | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const flightRef = useRef<ResumeFlight>({
    seq: 0,
    controller: null,
    baselineData: hostBaseline(formDataProp),
    candidate: null,
    candidateStepIndex: 0,
    candidateStepId: steps[0]?.stepId ?? '',
    settled: false,
  })
  const adapterRef = useRef(resumeAdapter)
  const prevAdapterRef = useRef(resumeAdapter)
  const onChangeRef = useRef(onChange)
  const onStatusRef = useRef(onResumeStatusChange)
  const formDataPropRef = useRef(formDataProp)

  adapterRef.current = resumeAdapter
  onChangeRef.current = onChange
  onStatusRef.current = onResumeStatusChange
  formDataPropRef.current = formDataProp

  const emitStatus = useCallback(
    (
      status: ProgressiveResumeStatus,
      target?: { readonly stepId: string; readonly stepIndex: number },
    ) => {
      const payload: ProgressiveResumeStatusData = {
        status,
        serviceId: definition.serviceId,
        formVersion: definition.version,
        ...(target ? { stepId: target.stepId, stepIndex: target.stepIndex } : {}),
      }
      onStatusRef.current?.(payload)
    },
    [definition.serviceId, definition.version],
  )

  const invalidate = useCallback(() => {
    flightRef.current.seq += 1
    const controller = flightRef.current.controller
    flightRef.current.controller = null
    flightRef.current.candidate = null
    controller?.abort()
  }, [])

  const finishReady = useCallback(
    (next: ProgressiveResumeCommit) => {
      flightRef.current.settled = true
      flightRef.current.candidate = null
      flightRef.current.controller = null
      setCommit(next)
      setPhase('ready')
      if (next.settlement === 'loaded') {
        const step = steps[next.stepIndex]
        emitStatus('loaded', {
          stepId: step?.stepId ?? next.stepIndex.toString(),
          stepIndex: next.stepIndex,
        })
      } else {
        emitStatus(next.settlement)
      }
    },
    [emitStatus, steps],
  )

  // Unmount abort.
  useEffect(() => {
    return () => {
      invalidate()
    }
  }, [invalidate])

  const stepsRef = useRef(steps)
  stepsRef.current = steps
  const stepsIdentity = steps.map((step) => step.stepId).join('\0')
  const emitStatusRef = useRef(emitStatus)
  const finishReadyRef = useRef(finishReady)
  emitStatusRef.current = emitStatus
  finishReadyRef.current = finishReady

  // Recover when revision becomes valid after config_invalid.
  useEffect(() => {
    if (revisionOk && phase === 'config_invalid' && !flightRef.current.settled) {
      setPhase('loading')
      setRetryNonce((n) => n + 1)
    }
  }, [phase, revisionOk])

  // Adapter change while loading/awaiting → abort and retry; after settle → no reload.
  useEffect(() => {
    if (prevAdapterRef.current === resumeAdapter) {
      return
    }
    prevAdapterRef.current = resumeAdapter
    if (flightRef.current.settled) {
      return
    }
    if (phase === 'loading' || phase === 'awaiting_host') {
      invalidate()
      setPhase('loading')
      setRetryNonce((n) => n + 1)
    }
  }, [invalidate, phase, resumeAdapter])

  // Primary load effect — locale intentionally omitted (copy only).
  // Callbacks are read from refs so host re-renders do not restart loading.
  useEffect(() => {
    if (!revisionOk) {
      setPhase('config_invalid')
      setCommit(null)
      return
    }
    if (flightRef.current.settled) {
      return
    }

    const baseline = hostBaseline(formDataPropRef.current)
    flightRef.current.baselineData = baseline
    flightRef.current.candidate = null

    invalidate()
    const seq = flightRef.current.seq
    const controller = new AbortController()
    flightRef.current.controller = controller

    setPhase('loading')
    setCommit(null)

    void (async () => {
      // StrictMode-safe: only the live mount proceeds past this microtask.
      await Promise.resolve()
      if (seq !== flightRef.current.seq || controller.signal.aborted) {
        // Cancelled pre-invocation setup — no public status.
        return
      }

      const adapter = adapterRef.current
      // Public loading corresponds 1:1 with an actual adapter invocation.
      emitStatusRef.current('loading')
      try {
        const result = await adapter.loadProgress({
          serviceId: definition.serviceId,
          formVersion: definition.version,
          resumeContextRevision: revision,
          signal: controller.signal,
        })
        if (seq !== flightRef.current.seq || controller.signal.aborted) {
          return
        }

        const admitted = admitProgressiveResumeResult({
          result,
          serviceId: definition.serviceId,
          formVersion: definition.version,
          resumeContextRevision: revision,
          steps: stepsRef.current,
        })

        if (!admitted.ok) {
          flightRef.current.controller = null
          setPhase('failed')
          emitStatusRef.current('failed')
          return
        }

        if (admitted.kind === 'not_found') {
          flightRef.current.controller = null
          finishReadyRef.current({
            formData: baseline,
            stepIndex: 0,
            settlement: 'not_found',
          })
          return
        }

        const detached = { ...admitted.formData } as Record<string, unknown>

        if (!formDataControlled) {
          flightRef.current.controller = null
          finishReadyRef.current({
            formData: detached,
            stepIndex: admitted.targetStepIndex,
            settlement: 'loaded',
          })
          return
        }

        const hostNow = hostBaseline(formDataPropRef.current)
        if (deepEquals(hostNow, detached)) {
          flightRef.current.controller = null
          finishReadyRef.current({
            formData: hostNow,
            stepIndex: admitted.targetStepIndex,
            settlement: 'loaded',
          })
          return
        }

        if (!onChangeRef.current) {
          flightRef.current.controller = null
          finishReadyRef.current({
            formData: hostNow,
            stepIndex: 0,
            settlement: 'discarded',
          })
          return
        }

        flightRef.current.candidate = detached
        flightRef.current.candidateStepIndex = admitted.targetStepIndex
        flightRef.current.candidateStepId = admitted.targetStepId
        flightRef.current.controller = null
        setPhase('awaiting_host')
        onChangeRef.current({ formData: detached })
      } catch {
        if (seq !== flightRef.current.seq || controller.signal.aborted) {
          return
        }
        flightRef.current.controller = null
        setPhase('failed')
        emitStatusRef.current('failed')
      }
    })()
  }, [
    definition.serviceId,
    definition.version,
    formDataControlled,
    invalidate,
    retryNonce,
    revision,
    revisionOk,
    stepsIdentity,
  ])

  // Controlled acknowledgement / external discard while loading or awaiting.
  useEffect(() => {
    if (phase !== 'loading' && phase !== 'awaiting_host') {
      return
    }
    if (!formDataControlled) {
      return
    }

    const hostNow = hostBaseline(formDataProp)
    const baseline = flightRef.current.baselineData
    const candidate = flightRef.current.candidate

    if (phase === 'awaiting_host' && candidate) {
      if (deepEquals(hostNow, candidate)) {
        finishReady({
          formData: hostNow,
          stepIndex: flightRef.current.candidateStepIndex,
          settlement: 'loaded',
        })
        return
      }
      if (deepEquals(hostNow, baseline)) {
        return
      }
      invalidate()
      finishReady({
        formData: hostNow,
        stepIndex: 0,
        settlement: 'discarded',
      })
      return
    }

    // loading: semantic host change vs baseline discards.
    if (phase === 'loading' && !deepEquals(hostNow, baseline)) {
      invalidate()
      finishReady({
        formData: hostNow,
        stepIndex: 0,
        settlement: 'discarded',
      })
    }
  }, [finishReady, formDataControlled, formDataProp, invalidate, phase])

  function handleRetry() {
    if (phase !== 'failed') {
      return
    }
    flightRef.current.settled = false
    setRetryNonce((n) => n + 1)
  }

  if (phase === 'ready' && commit) {
    return <>{children(commit)}</>
  }

  const statusId = `${idPrefix}-resume-status`
  const busy = phase === 'loading' || phase === 'awaiting_host'

  return (
    <div
      className="dg20-renderer-resume-gate"
      data-dg20-resume={phase}
      aria-busy={busy ? true : undefined}
    >
      {phase === 'config_invalid' ? (
        <p className="dg20-renderer-resume-status" role="status" aria-live="polite" id={statusId}>
          {resolveRendererMessage('resumeConfigUnavailable', locale)}
        </p>
      ) : null}
      {busy ? (
        <p className="dg20-renderer-resume-status" role="status" aria-live="polite" id={statusId}>
          {resolveRendererMessage('resumeLoading', locale)}
        </p>
      ) : null}
      {phase === 'failed' ? (
        <>
          <p className="dg20-renderer-resume-failure" role="alert" id={statusId}>
            {resolveRendererMessage('resumeFailed', locale)}
          </p>
          <div className="dg20-renderer-actions">
            <button
              type="button"
              className="dg20-renderer-nav-btn dg20-renderer-resume-retry"
              onClick={handleRetry}
            >
              {resolveRendererMessage('resumeRetry', locale)}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

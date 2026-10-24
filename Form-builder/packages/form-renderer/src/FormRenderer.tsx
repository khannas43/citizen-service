import Form from '@rjsf/core'
import type { IChangeEvent } from '@rjsf/core'
import {
  deepEquals,
  type ErrorSchema,
  type RJSFSchema,
  type RJSFValidationError,
  type UiSchema,
} from '@rjsf/utils'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react'

import type { FormDefinition } from '@dg20/form-contract'
import {
  dg20Fields,
  dg20Widgets,
  WidgetRuntimeProvider,
  type FieldIdResolver,
  type WidgetMessageOverrides,
  type WidgetServicePorts,
} from '@dg20/form-widgets'

import { admitFormDefinition } from './definition-admission.js'
import {
  createAutosaveSnapshot,
  type ProgressiveAutosaveAdapter,
  type ProgressiveAutosaveStatus,
  type ProgressiveAutosaveStatusData,
} from './progressive-autosave.js'
import { ProgressiveResumeGate } from './ProgressiveResumeGate.js'
import { resumeSessionTokenForKey, type ProgressiveResumeAdapter } from './progressive-resume.js'
import { useSessionCafServices } from './use-session-caf-services.js'
import {
  earliestStepIndexForErrors,
  filterErrorSchemaForStep,
  mergeStepFormData,
  pickStepFormData,
  type ProgressivePlan,
  type ProgressiveStepPlan,
} from './progressive-steps.js'
import { resolveRendererMessage } from './renderer-messages.js'
import type {
  FormRendererLocale,
  FormRendererProps,
  FormRendererStepChangeData,
} from './renderer-types.js'
import { getDg20FormValidator } from './validator-2020.js'

/** Explicit RJSF id separator — stable across instances and rerenders. */
export const DG20_RENDERER_ID_SEPARATOR = '_' as const

function isLocale(value: unknown): value is FormRendererLocale {
  return value === 'en' || value === 'gu'
}

function definitionSessionKey(
  definition: FormDefinition,
  formDataControlled: boolean,
  resumeSessionToken: string,
): string {
  return `${definition.serviceId}@${definition.version}:${formDataControlled ? 'c' : 'u'}:rr=${resumeSessionToken}`
}

function stepLabel(step: ProgressiveStepPlan, locale: FormRendererLocale): string {
  return locale === 'gu' ? step.labelGu : step.labelEn
}

interface AdmittedFormSessionProps {
  readonly definition: FormDefinition
  readonly plan: ProgressivePlan
  readonly idPrefix: string
  readonly locale: FormRendererLocale
  readonly formDataProp: Readonly<Record<string, unknown>> | undefined
  readonly formDataControlled: boolean
  readonly onChange?: FormRendererProps['onChange']
  readonly onSubmit?: FormRendererProps['onSubmit']
  readonly onStepChange?: FormRendererProps['onStepChange']
  readonly autosaveAdapter?: ProgressiveAutosaveAdapter
  readonly onAutosaveStatusChange?: FormRendererProps['onAutosaveStatusChange']
  readonly resumeAdapter?: ProgressiveResumeAdapter
  readonly resumeContextRevision?: string
  readonly onResumeStatusChange?: FormRendererProps['onResumeStatusChange']
  readonly disabled: boolean
  readonly readOnly: boolean
  readonly services?: WidgetServicePorts
  readonly messageOverrides?: WidgetMessageOverrides
  readonly resolveFieldId?: FieldIdResolver
  readonly feeContextRevision?: string
  readonly eSignContextRevision?: string
}

function SinglePageSession({
  definition,
  idPrefix,
  locale,
  formDataProp,
  formDataControlled,
  onChange,
  onSubmit,
  disabled,
  readOnly,
  services,
  messageOverrides,
  resolveFieldId,
  feeContextRevision,
  eSignContextRevision,
}: Omit<
  AdmittedFormSessionProps,
  | 'plan'
  | 'onStepChange'
  | 'autosaveAdapter'
  | 'onAutosaveStatusChange'
  | 'resumeAdapter'
  | 'resumeContextRevision'
  | 'onResumeStatusChange'
>): ReactElement {
  const schema = definition.jsonSchema as RJSFSchema
  const uiSchema = definition.uiSchema as UiSchema
  const validator = getDg20FormValidator(definition.jsonSchema)

  const [internalFormData, setInternalFormData] = useState<Record<string, unknown>>(() =>
    formDataProp ? { ...formDataProp } : {},
  )
  const formData = formDataControlled ? (formDataProp as Record<string, unknown>) : internalFormData

  const handleFormChange = useCallback(
    (event: IChangeEvent) => {
      const next = (event.formData ?? {}) as Record<string, unknown>
      if (deepEquals(formData, next)) {
        return
      }
      if (!formDataControlled) {
        setInternalFormData(next)
      }
      onChange?.({ formData: next })
    },
    [formData, formDataControlled, onChange],
  )

  const handleSubmit = useCallback(
    (event: IChangeEvent, _nativeEvent?: FormEvent<HTMLFormElement>) => {
      if (!onSubmit) {
        return
      }
      const next = (event.formData ?? {}) as Record<string, unknown>
      if (!deepEquals(formData, next)) {
        if (!formDataControlled) {
          setInternalFormData(next)
        }
        onChange?.({ formData: next })
      }
      onSubmit({ formData: next })
    },
    [formData, formDataControlled, onChange, onSubmit],
  )

  return (
    <WidgetRuntimeProvider
      locale={locale}
      bilingual={definition.meta.bilingual}
      prefillBindings={definition.meta.prefillBindings}
      services={services}
      disabled={disabled}
      readOnly={readOnly}
      messageOverrides={messageOverrides}
      resolveFieldId={resolveFieldId}
      feeContextRevision={feeContextRevision}
      eSignContextRevision={eSignContextRevision}
    >
      <Form
        schema={schema}
        uiSchema={uiSchema}
        formData={formData}
        validator={validator}
        widgets={dg20Widgets}
        fields={dg20Fields}
        idPrefix={idPrefix}
        idSeparator={DG20_RENDERER_ID_SEPARATOR}
        disabled={disabled}
        readonly={readOnly}
        liveValidate={false}
        noHtml5Validate
        showErrorList={false}
        focusOnFirstError
        onChange={handleFormChange}
        onSubmit={handleSubmit}
      >
        {onSubmit ? (
          <div className="dg20-renderer-actions">
            <button type="submit" className="dg20-renderer-submit" disabled={disabled || readOnly}>
              {resolveRendererMessage('submit', locale)}
            </button>
          </div>
        ) : (
          <></>
        )}
      </Form>
    </WidgetRuntimeProvider>
  )
}

/** Internal UI phase — `awaiting_host` never appears in public status callbacks. */
type AutosaveUiPhase = ProgressiveAutosaveStatus | 'awaiting_host'

interface PendingAutosaveIntent {
  readonly intentSeq: number
  readonly merged: Record<string, unknown>
  readonly fromIndex: number
  readonly preChange: Record<string, unknown>
  started: boolean
}

interface AutosaveFlight {
  seq: number
  pending: PendingAutosaveIntent | null
  controller: AbortController | null
  /** Acknowledged complete form data currently being saved. */
  baselineData: Record<string, unknown> | null
}

function ProgressiveSession({
  definition,
  plan,
  idPrefix,
  locale,
  formDataProp,
  formDataControlled,
  onChange,
  onSubmit,
  onStepChange,
  autosaveAdapter,
  onAutosaveStatusChange,
  disabled,
  readOnly,
  services,
  messageOverrides,
  resolveFieldId,
  feeContextRevision,
  eSignContextRevision,
  initialStepIndex = 0,
  seedFormData,
}: AdmittedFormSessionProps & {
  readonly plan: Extract<ProgressivePlan, { kind: 'progressive' }>
  readonly initialStepIndex?: number
  /** Uncontrolled resume seed — ignored when formDataControlled. */
  readonly seedFormData?: Record<string, unknown>
}): ReactElement {
  const steps = plan.steps
  const totalSteps = steps.length

  const [stepIndex, setStepIndex] = useState(() =>
    Math.min(Math.max(initialStepIndex, 0), Math.max(totalSteps - 1, 0)),
  )
  const [internalFormData, setInternalFormData] = useState<Record<string, unknown>>(() => {
    if (!formDataControlled && seedFormData) {
      return { ...seedFormData }
    }
    return formDataProp ? { ...formDataProp } : {}
  })
  const [injectedErrorSchema, setInjectedErrorSchema] = useState<ErrorSchema | undefined>()
  const [guidanceKind, setGuidanceKind] = useState<'none' | 'step' | 'full'>('none')
  const [focusHeadingToken, setFocusHeadingToken] = useState(0)
  const [autosavePhase, setAutosavePhase] = useState<AutosaveUiPhase>('idle')
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const skipHeadingFocusOnMount = useRef(true)
  const flightRef = useRef<AutosaveFlight>({
    seq: 0,
    pending: null,
    controller: null,
    baselineData: null,
  })
  const autosaveAdapterRef = useRef(autosaveAdapter)
  const prevAdapterRef = useRef(autosaveAdapter)
  const onAutosaveStatusChangeRef = useRef(onAutosaveStatusChange)
  const onStepChangeRef = useRef(onStepChange)
  const onChangeRef = useRef(onChange)

  autosaveAdapterRef.current = autosaveAdapter
  onAutosaveStatusChangeRef.current = onAutosaveStatusChange
  onStepChangeRef.current = onStepChange
  onChangeRef.current = onChange

  const completeData = formDataControlled
    ? (formDataProp as Record<string, unknown>)
    : internalFormData

  const safeIndex = Math.min(Math.max(stepIndex, 0), totalSteps - 1)
  const activeStep = steps[safeIndex]!
  const stepValidator = getDg20FormValidator(activeStep.schema)
  const fullValidator = getDg20FormValidator(definition.jsonSchema)
  const stepFormData = pickStepFormData(completeData, activeStep.fieldIds)
  const stepExtraErrors = filterErrorSchemaForStep(injectedErrorSchema, activeStep.fieldIds)
  const isSaving = autosavePhase === 'saving'
  const isAwaitingHost = autosavePhase === 'awaiting_host'
  const autosaveBusy = isSaving || isAwaitingHost
  const entryLocked = disabled || autosaveBusy

  const invalidateAllAutosave = useCallback(() => {
    flightRef.current.seq += 1
    const controller = flightRef.current.controller
    flightRef.current.controller = null
    flightRef.current.baselineData = null
    flightRef.current.pending = null
    controller?.abort()
  }, [])

  const emitAutosaveStatus = useCallback(
    (status: ProgressiveAutosaveStatusData['status'], step: ProgressiveStepPlan, index: number) => {
      onAutosaveStatusChangeRef.current?.({
        status,
        serviceId: definition.serviceId,
        formVersion: definition.version,
        stepId: step.stepId,
        stepIndex: index,
      })
    },
    [definition.serviceId, definition.version],
  )

  useEffect(() => {
    if (skipHeadingFocusOnMount.current) {
      skipHeadingFocusOnMount.current = false
      return
    }
    headingRef.current?.focus()
  }, [focusHeadingToken, safeIndex])

  // Unmount: cancel pending intent and in-flight save (no failed status).
  useEffect(() => {
    return () => {
      invalidateAllAutosave()
    }
  }, [invalidateAllAutosave])

  // Adapter identity change: cancel pending + in-flight.
  useEffect(() => {
    if (prevAdapterRef.current !== autosaveAdapter) {
      prevAdapterRef.current = autosaveAdapter
      if (flightRef.current.pending || flightRef.current.controller) {
        invalidateAllAutosave()
        setAutosavePhase((phase) =>
          phase === 'saving' || phase === 'awaiting_host' ? 'idle' : phase,
        )
      }
    }
  }, [autosaveAdapter, invalidateAllAutosave])

  // disabled/readOnly: cancel pending + in-flight.
  useEffect(() => {
    if (!(disabled || readOnly)) {
      return
    }
    if (flightRef.current.pending || flightRef.current.controller) {
      invalidateAllAutosave()
      setAutosavePhase((phase) =>
        phase === 'saving' || phase === 'awaiting_host' ? 'idle' : phase,
      )
    }
  }, [disabled, readOnly, invalidateAllAutosave])

  const beginAdapterSave = useCallback(
    async (merged: Record<string, unknown>, fromIndex: number, intentSeq: number) => {
      const adapter = autosaveAdapterRef.current
      const step = steps[fromIndex]
      if (!adapter || !step) {
        flightRef.current.pending = null
        return
      }
      if (intentSeq !== flightRef.current.seq) {
        return
      }
      if (flightRef.current.controller) {
        return
      }

      const snapshot = createAutosaveSnapshot(merged)
      if (!snapshot.ok) {
        flightRef.current.pending = null
        setAutosavePhase('failed')
        emitAutosaveStatus('failed', step, fromIndex)
        return
      }

      const controller = new AbortController()
      flightRef.current.pending = null
      flightRef.current.controller = controller
      flightRef.current.baselineData = merged

      setAutosavePhase('saving')
      emitAutosaveStatus('saving', step, fromIndex)

      try {
        await adapter.saveProgress({
          serviceId: definition.serviceId,
          formVersion: definition.version,
          completedStepId: step.stepId,
          completedStepIndex: fromIndex,
          formData: snapshot.snapshot,
          signal: controller.signal,
        })

        if (intentSeq !== flightRef.current.seq || controller.signal.aborted) {
          return
        }

        flightRef.current.controller = null
        flightRef.current.baselineData = null
        setAutosavePhase('saved')
        emitAutosaveStatus('saved', step, fromIndex)
        const clamped = Math.min(Math.max(fromIndex + 1, 0), totalSteps - 1)
        const nextStep = steps[clamped]!
        setStepIndex(clamped)
        setFocusHeadingToken((token) => token + 1)
        onStepChangeRef.current?.({
          stepId: nextStep.stepId,
          stepIndex: clamped,
          totalSteps,
          direction: 'next',
        })
      } catch {
        if (intentSeq !== flightRef.current.seq || controller.signal.aborted) {
          return
        }
        flightRef.current.controller = null
        flightRef.current.baselineData = null
        setAutosavePhase('failed')
        emitAutosaveStatus('failed', step, fromIndex)
      }
    },
    [definition.serviceId, definition.version, emitAutosaveStatus, steps, totalSteps],
  )

  // Host acknowledgement watcher (controlled) / commit watcher (uncontrolled).
  useEffect(() => {
    const pending = flightRef.current.pending
    if (!pending || pending.started) {
      return
    }
    if (disabled || readOnly) {
      return
    }

    if (deepEquals(completeData, pending.merged)) {
      pending.started = true
      void beginAdapterSave(pending.merged, pending.fromIndex, pending.intentSeq)
      return
    }

    if (!deepEquals(completeData, pending.preChange)) {
      // Host replaced with a different semantic value — cancel before adapter.
      invalidateAllAutosave()
      setAutosavePhase('idle')
    }
    // Else: still at pre-change — keep waiting (controlled ignore path).
  }, [beginAdapterSave, completeData, disabled, invalidateAllAutosave, readOnly])

  // In-flight: only acknowledged baseline is tolerated (no preSave lag).
  useEffect(() => {
    if (autosavePhase !== 'saving' || !flightRef.current.baselineData) {
      return
    }
    if (deepEquals(completeData, flightRef.current.baselineData)) {
      return
    }
    invalidateAllAutosave()
    setAutosavePhase('idle')
  }, [autosavePhase, completeData, invalidateAllAutosave])

  const emitCompleteIfChanged = useCallback(
    (nextComplete: Record<string, unknown>): boolean => {
      if (deepEquals(completeData, nextComplete)) {
        return false
      }
      if (!formDataControlled) {
        setInternalFormData(nextComplete)
      }
      onChangeRef.current?.({ formData: nextComplete })
      return true
    },
    [completeData, formDataControlled],
  )

  const emitStepChange = useCallback((payload: FormRendererStepChangeData) => {
    onStepChangeRef.current?.(payload)
  }, [])

  const goToStep = useCallback(
    (nextIndex: number, direction: FormRendererStepChangeData['direction']) => {
      const clamped = Math.min(Math.max(nextIndex, 0), totalSteps - 1)
      const step = steps[clamped]!
      setStepIndex(clamped)
      setFocusHeadingToken((token) => token + 1)
      emitStepChange({
        stepId: step.stepId,
        stepIndex: clamped,
        totalSteps,
        direction,
      })
    },
    [emitStepChange, steps, totalSteps],
  )

  const queueAutosaveIntent = useCallback(
    (merged: Record<string, unknown>, fromIndex: number, preChange: Record<string, unknown>) => {
      if (flightRef.current.controller || flightRef.current.pending) {
        return
      }
      const intentSeq = flightRef.current.seq + 1
      flightRef.current.seq = intentSeq

      const changed = !deepEquals(preChange, merged)

      if (!changed) {
        // Unchanged — save immediately (still emit public saving only when adapter runs).
        const pending: PendingAutosaveIntent = {
          intentSeq,
          merged,
          fromIndex,
          preChange,
          started: true,
        }
        flightRef.current.pending = pending
        void beginAdapterSave(merged, fromIndex, intentSeq)
        return
      }

      if (!formDataControlled) {
        setInternalFormData(merged)
      }
      onChangeRef.current?.({ formData: merged })

      if (!formDataControlled) {
        // Uncontrolled: committed to session state; start after this render via watcher
        // (completeData will equal merged). Mark pending not-started for single StrictMode run.
        flightRef.current.pending = {
          intentSeq,
          merged,
          fromIndex,
          preChange,
          started: false,
        }
        setAutosavePhase('awaiting_host')
        return
      }

      // Controlled: wait for host echo before adapter.
      flightRef.current.pending = {
        intentSeq,
        merged,
        fromIndex,
        preChange,
        started: false,
      }
      setAutosavePhase('awaiting_host')
    },
    [beginAdapterSave, formDataControlled],
  )

  const handleStepChange = useCallback(
    (event: IChangeEvent) => {
      if (disabled || readOnly || autosaveBusy) {
        return
      }
      const stepData = (event.formData ?? {}) as Record<string, unknown>
      const merged = mergeStepFormData(completeData, activeStep.fieldIds, stepData)
      if (injectedErrorSchema) {
        setInjectedErrorSchema(undefined)
      }
      if (guidanceKind !== 'none') {
        setGuidanceKind('none')
      }
      if (autosavePhase === 'failed') {
        setAutosavePhase('idle')
      }
      emitCompleteIfChanged(merged)
    },
    [
      activeStep.fieldIds,
      autosaveBusy,
      autosavePhase,
      completeData,
      disabled,
      emitCompleteIfChanged,
      guidanceKind,
      injectedErrorSchema,
      readOnly,
    ],
  )

  const handleBack = useCallback(() => {
    if (disabled || safeIndex <= 0 || autosaveBusy) {
      return
    }
    setGuidanceKind('none')
    setInjectedErrorSchema(undefined)
    setAutosavePhase('idle')
    goToStep(safeIndex - 1, 'back')
  }, [autosaveBusy, disabled, goToStep, safeIndex])

  const handleReadOnlyNext = useCallback(() => {
    if (disabled || !readOnly || safeIndex >= totalSteps - 1) {
      return
    }
    setGuidanceKind('none')
    setInjectedErrorSchema(undefined)
    goToStep(safeIndex + 1, 'next')
  }, [disabled, goToStep, readOnly, safeIndex, totalSteps])

  const handleStepFormSubmit = useCallback(
    (event: IChangeEvent, _nativeEvent?: FormEvent<HTMLFormElement>) => {
      if (disabled || readOnly || autosaveBusy) {
        return
      }
      const stepData = (event.formData ?? {}) as Record<string, unknown>
      const preChange = completeData
      const merged = mergeStepFormData(completeData, activeStep.fieldIds, stepData)
      setGuidanceKind('none')
      setInjectedErrorSchema(undefined)

      const isLast = safeIndex >= totalSteps - 1
      if (!isLast) {
        if (autosaveAdapterRef.current) {
          queueAutosaveIntent(merged, safeIndex, preChange)
          return
        }
        emitCompleteIfChanged(merged)
        setAutosavePhase('idle')
        goToStep(safeIndex + 1, 'next')
        return
      }

      emitCompleteIfChanged(merged)

      if (!onSubmit) {
        return
      }

      const validation = fullValidator.validateFormData(merged, definition.jsonSchema as RJSFSchema)
      if ((validation.errors?.length ?? 0) === 0) {
        setInjectedErrorSchema(undefined)
        onSubmit({ formData: merged })
        return
      }

      const propertyNames = (validation.errors ?? []).map((err: RJSFValidationError) => {
        const property = typeof err.property === 'string' ? err.property : ''
        const name = typeof err.name === 'string' ? err.name : ''
        return property || name
      })
      const targetIndex = earliestStepIndexForErrors(steps, validation.errorSchema, propertyNames)
      setInjectedErrorSchema(validation.errorSchema)
      setGuidanceKind('full')
      if (targetIndex !== safeIndex) {
        goToStep(targetIndex, 'validation_redirect')
      } else {
        setFocusHeadingToken((token) => token + 1)
      }
    },
    [
      activeStep.fieldIds,
      autosaveBusy,
      completeData,
      definition.jsonSchema,
      disabled,
      emitCompleteIfChanged,
      fullValidator,
      goToStep,
      onSubmit,
      queueAutosaveIntent,
      readOnly,
      safeIndex,
      steps,
      totalSteps,
    ],
  )

  const handleStepError = useCallback(() => {
    if (disabled || readOnly || autosaveBusy) {
      return
    }
    setGuidanceKind('step')
  }, [autosaveBusy, disabled, readOnly])

  const progressText = resolveRendererMessage('stepProgress', locale, {
    current: safeIndex + 1,
    total: totalSteps,
  })
  const navLocked = disabled || autosaveBusy

  return (
    <WidgetRuntimeProvider
      locale={locale}
      bilingual={definition.meta.bilingual}
      prefillBindings={definition.meta.prefillBindings}
      services={services}
      disabled={entryLocked}
      readOnly={readOnly}
      messageOverrides={messageOverrides}
      resolveFieldId={resolveFieldId}
      feeContextRevision={feeContextRevision}
      eSignContextRevision={eSignContextRevision}
    >
      <div
        className="dg20-renderer-progressive"
        data-dg20-progressive=""
        data-dg20-autosave={autosavePhase}
        aria-busy={autosaveBusy ? true : undefined}
      >
        <nav
          className="dg20-renderer-step-nav"
          aria-label={resolveRendererMessage('stepNavLabel', locale)}
        >
          <ol className="dg20-renderer-step-list">
            {steps.map((step, index) => {
              const active = index === safeIndex
              return (
                <li
                  key={step.stepId}
                  className={
                    active
                      ? 'dg20-renderer-step-item dg20-renderer-step-item-active'
                      : 'dg20-renderer-step-item'
                  }
                  aria-current={active ? 'step' : undefined}
                >
                  <span className="dg20-renderer-step-index">{index + 1}</span>
                  <span className="dg20-renderer-step-label">{stepLabel(step, locale)}</span>
                </li>
              )
            })}
          </ol>
        </nav>

        <p className="dg20-renderer-step-progress" data-dg20-step-progress="">
          {progressText}
        </p>

        <h2
          ref={headingRef}
          className="dg20-renderer-step-heading"
          tabIndex={-1}
          id={`${idPrefix}-step-heading`}
        >
          {stepLabel(activeStep, locale)}
        </h2>

        {isSaving ? (
          <p className="dg20-renderer-autosave-status" role="status" aria-live="polite">
            {resolveRendererMessage('autosaveSaving', locale)}
          </p>
        ) : null}
        {autosavePhase === 'saved' ? (
          <p className="dg20-renderer-autosave-status" role="status" aria-live="polite">
            {resolveRendererMessage('autosaveSaved', locale)}
          </p>
        ) : null}
        {autosavePhase === 'failed' ? (
          <p className="dg20-renderer-autosave-failure" role="alert">
            {resolveRendererMessage('autosaveFailed', locale)}
          </p>
        ) : null}

        {guidanceKind === 'step' ? (
          <p className="dg20-renderer-validation-guidance" role="alert">
            {resolveRendererMessage('stepValidationGuidance', locale)}
          </p>
        ) : null}
        {guidanceKind === 'full' ? (
          <p className="dg20-renderer-validation-guidance" role="alert">
            {resolveRendererMessage('fullValidationGuidance', locale)}
          </p>
        ) : null}

        <Form
          key={`${activeStep.stepId}:${safeIndex}`}
          schema={activeStep.schema}
          uiSchema={activeStep.uiSchema}
          formData={stepFormData}
          validator={stepValidator}
          widgets={dg20Widgets}
          fields={dg20Fields}
          idPrefix={`${idPrefix}_s${safeIndex}`}
          idSeparator={DG20_RENDERER_ID_SEPARATOR}
          disabled={entryLocked}
          readonly={readOnly}
          liveValidate={false}
          noHtml5Validate
          showErrorList={false}
          focusOnFirstError={!readOnly && !autosaveBusy}
          extraErrors={stepExtraErrors}
          extraErrorsBlockSubmit
          onChange={handleStepChange}
          onSubmit={handleStepFormSubmit}
          onError={handleStepError}
        >
          <div className="dg20-renderer-actions dg20-renderer-step-actions">
            {safeIndex > 0 ? (
              <button
                type="button"
                className="dg20-renderer-nav-btn dg20-renderer-nav-back"
                onClick={handleBack}
                disabled={navLocked}
                aria-disabled={navLocked ? true : undefined}
              >
                {resolveRendererMessage('navBack', locale)}
              </button>
            ) : null}
            {safeIndex < totalSteps - 1 ? (
              readOnly ? (
                <button
                  type="button"
                  className="dg20-renderer-nav-btn dg20-renderer-nav-next"
                  onClick={handleReadOnlyNext}
                  disabled={disabled}
                  aria-disabled={disabled ? true : undefined}
                >
                  {resolveRendererMessage('navNext', locale)}
                </button>
              ) : autosavePhase === 'failed' ? (
                <button
                  type="submit"
                  className="dg20-renderer-nav-btn dg20-renderer-autosave-retry"
                  disabled={navLocked}
                  aria-disabled={navLocked ? true : undefined}
                >
                  {resolveRendererMessage('autosaveRetry', locale)}
                </button>
              ) : (
                <button
                  type="submit"
                  className="dg20-renderer-nav-btn dg20-renderer-nav-next"
                  disabled={navLocked}
                  aria-disabled={navLocked ? true : undefined}
                >
                  {resolveRendererMessage('navNext', locale)}
                </button>
              )
            ) : onSubmit ? (
              <button
                type="submit"
                className="dg20-renderer-submit"
                disabled={disabled || readOnly || autosaveBusy}
              >
                {resolveRendererMessage('submit', locale)}
              </button>
            ) : (
              <></>
            )}
          </div>
        </Form>
      </div>
    </WidgetRuntimeProvider>
  )
}

function AdmittedFormSession(props: AdmittedFormSessionProps): ReactElement {
  // FB-B5: session-scoped CAF coordinator — resets with this session's remount
  // (service/version/control-mode/canonical resume revision) and host adapter swaps.
  const sessionServices = useSessionCafServices(props.services)
  const sessionProps = { ...props, services: sessionServices }

  if (sessionProps.plan.kind === 'single_page') {
    return <SinglePageSession {...sessionProps} />
  }

  const progressivePlan = sessionProps.plan
  if (!sessionProps.resumeAdapter) {
    return <ProgressiveSession {...sessionProps} plan={progressivePlan} />
  }

  return (
    <ProgressiveResumeGate
      definition={sessionProps.definition}
      steps={progressivePlan.steps}
      locale={sessionProps.locale}
      formDataProp={sessionProps.formDataProp}
      formDataControlled={sessionProps.formDataControlled}
      onChange={sessionProps.onChange}
      resumeAdapter={sessionProps.resumeAdapter}
      resumeContextRevision={sessionProps.resumeContextRevision}
      onResumeStatusChange={sessionProps.onResumeStatusChange}
      idPrefix={sessionProps.idPrefix}
    >
      {(commit) => (
        <ProgressiveSession
          {...sessionProps}
          plan={progressivePlan}
          initialStepIndex={commit.stepIndex}
          seedFormData={sessionProps.formDataControlled ? undefined : commit.formData}
          formDataProp={
            sessionProps.formDataControlled ? sessionProps.formDataProp : commit.formData
          }
        />
      )}
    </ProgressiveResumeGate>
  )
}

/**
 * Single Form Renderer for citizen portal and Builder live preview.
 * Always uses dg20Widgets / dg20Fields and the Ajv2020 validator — no extension points.
 *
 * Progressive steps (FB-B1 / B1.1): when meta.progressiveSteps is nonempty and valid,
 * renders one step at a time with Next/Back and full-schema validation on Finish.
 * Empty progressiveSteps preserve FB-B0.1 single-page behavior.
 * Plan comes from admission — never rebuilt in the renderer.
 *
 * Autosave (FB-B2): optional host ProgressiveAutosaveAdapter between steps.
 * Resume (FB-B4): optional host ProgressiveResumeAdapter before first step mount.
 * CAF (FB-B5): session-scoped coordinator around services.cafPrefill; lazy
 * field-owned resolution on the active step after resume settles.
 */
export function FormRenderer(props: FormRendererProps): ReactElement {
  const {
    definition: rawDefinition,
    mode = 'citizen',
    formData: formDataProp,
    onChange,
    onSubmit,
    onStepChange,
    autosaveAdapter,
    onAutosaveStatusChange,
    resumeAdapter,
    resumeContextRevision,
    onResumeStatusChange,
    locale: localeProp,
    defaultLocale = 'en',
    onLocaleChange,
    showLocaleToggle = true,
    disabled = false,
    readOnly = false,
    services,
    messageOverrides,
    resolveFieldId,
    feeContextRevision,
    eSignContextRevision,
  } = props

  const reactId = useId()
  const instanceToken = reactId.replace(/:/g, '')
  const rootId = `dg20-renderer-${instanceToken}`
  const idPrefix = `dg20f-${instanceToken}`
  const bannerId = `${rootId}-preview-banner`
  const admissionErrorId = `${rootId}-admission-error`

  const controlledLocale = isLocale(localeProp)
  const [uncontrolledLocale, setUncontrolledLocale] = useState<FormRendererLocale>(() =>
    isLocale(defaultLocale) ? defaultLocale : 'en',
  )
  const locale: FormRendererLocale = controlledLocale ? localeProp : uncontrolledLocale
  const formDataControlled = formDataProp !== undefined

  const admission = useMemo(
    () => admitFormDefinition(rawDefinition, { mode }),
    [rawDefinition, mode],
  )

  const handleLocaleSelect = useCallback(
    (next: FormRendererLocale) => {
      if (next === locale) {
        return
      }
      if (!controlledLocale) {
        setUncontrolledLocale(next)
      }
      onLocaleChange?.(next)
    },
    [controlledLocale, locale, onLocaleChange],
  )

  const localeToggle = showLocaleToggle ? (
    <div
      className="dg20-renderer-locale"
      role="group"
      aria-label={resolveRendererMessage('localeToggleGroup', locale)}
    >
      <button
        type="button"
        className="dg20-renderer-locale-btn"
        aria-pressed={locale === 'en'}
        onClick={() => handleLocaleSelect('en')}
      >
        {resolveRendererMessage('localeEnglish', locale)}
      </button>
      <button
        type="button"
        className="dg20-renderer-locale-btn"
        aria-pressed={locale === 'gu'}
        onClick={() => handleLocaleSelect('gu')}
      >
        {resolveRendererMessage('localeGujarati', locale)}
      </button>
    </div>
  ) : null

  if (!admission.ok) {
    return (
      <div
        className="dg20-form-renderer"
        lang={locale === 'gu' ? 'gu' : 'en'}
        data-dg20-renderer=""
        data-dg20-mode={mode}
        data-dg20-admission="rejected"
        id={rootId}
      >
        {localeToggle}
        <div className="dg20-renderer-admission-error" id={admissionErrorId} role="alert">
          {resolveRendererMessage(admission.publicReasonKey, locale)}
        </div>
      </div>
    )
  }

  const { definition, plan } = admission
  const showPreviewBanner = mode === 'preview'
  const resumeSessionToken = resumeSessionTokenForKey(resumeAdapter, resumeContextRevision)
  const sessionKey = definitionSessionKey(definition, formDataControlled, resumeSessionToken)

  return (
    <div
      className={`dg20-form-renderer dg20-form-widgets${locale === 'gu' ? ' dg20-locale-gu' : ''}`}
      lang={locale === 'gu' ? 'gu' : 'en'}
      data-dg20-renderer=""
      data-dg20-mode={mode}
      data-dg20-admission="admitted"
      data-dg20-service={definition.serviceId}
      data-dg20-version={String(definition.version)}
      data-dg20-progressive={plan.kind === 'progressive' ? 'true' : 'false'}
      id={rootId}
      aria-describedby={showPreviewBanner ? bannerId : undefined}
    >
      {localeToggle}

      {showPreviewBanner ? (
        <div className="dg20-renderer-preview-banner" id={bannerId} role="status">
          {resolveRendererMessage('previewBanner', locale)}
        </div>
      ) : null}

      <AdmittedFormSession
        key={sessionKey}
        definition={definition}
        plan={plan}
        idPrefix={idPrefix}
        locale={locale}
        formDataProp={formDataProp}
        formDataControlled={formDataControlled}
        onChange={onChange}
        onSubmit={onSubmit}
        onStepChange={onStepChange}
        autosaveAdapter={autosaveAdapter}
        onAutosaveStatusChange={onAutosaveStatusChange}
        resumeAdapter={resumeAdapter}
        resumeContextRevision={resumeContextRevision}
        onResumeStatusChange={onResumeStatusChange}
        disabled={disabled}
        readOnly={readOnly}
        services={services}
        messageOverrides={messageOverrides}
        resolveFieldId={resolveFieldId}
        feeContextRevision={feeContextRevision}
        eSignContextRevision={eSignContextRevision}
      />
    </div>
  )
}

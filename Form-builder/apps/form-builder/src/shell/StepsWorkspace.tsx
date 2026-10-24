import { useEffect, useMemo, useRef } from 'react'

import type { AuthoringErrorCode, AuthoringUiState } from '../authoring/index.js'
import { getStepBoundaryCapabilities, stepHasUnsavedBilingualChanges } from '../authoring/index.js'
import type { BuilderLocale, BuilderMessageKey } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'

const STEPS_ALERT_MESSAGE: Partial<Record<AuthoringErrorCode, BuilderMessageKey>> = {
  progressive_steps_not_enabled: 'stepsAlertProgressiveNotEnabled',
  step_not_found: 'stepsAlertStepNotFound',
  field_not_in_step: 'stepsAlertFieldNotInStep',
  split_after_last_field: 'stepsAlertSplitAfterLast',
  boundary_not_found: 'stepsAlertBoundaryNotFound',
  boundary_move_would_empty_step: 'stepsAlertMoveWouldEmpty',
  step_has_unsaved_bilingual_changes: 'stepsAlertUnsavedBilingual',
  inconsistent_step_boundaries: 'stepsAlertInconsistent',
}

export interface StepsWorkspaceProps {
  readonly locale: BuilderLocale
  readonly uiState: AuthoringUiState
  readonly onEnableProgressive: () => void
  readonly onSplitAfterField: (stepId: string, fieldId: string) => void
  readonly onMoveBoundary: (previousStepId: string, direction: 'earlier' | 'later') => void
  readonly onMergeBoundary: (previousStepId: string) => void
  readonly onEditStepLabels: (stepId: string) => void
  readonly onClearAlert: () => void
}

function stepCardId(stepId: string): string {
  return `dg20-builder-steps-card-${stepId}`
}

function fieldLabel(
  uiState: AuthoringUiState,
  fieldId: string,
): { readonly label: string; readonly widgetType: string } {
  const definition = uiState.authoring.definition
  const label = definition.meta.bilingual.labels[fieldId]?.en ?? fieldId
  const provenance = definition.meta.paletteProvenance.find((entry) => entry.fieldId === fieldId)
  return { label, widgetType: provenance?.widgetType ?? 'unknown' }
}

export function StepsWorkspace({
  locale,
  uiState,
  onEnableProgressive,
  onSplitAfterField,
  onMoveBoundary,
  onMergeBoundary,
  onEditStepLabels,
  onClearAlert,
}: StepsWorkspaceProps) {
  const focusAppliedRef = useRef<number | null>(null)
  const definition = uiState.authoring.definition
  const steps = definition.meta.progressiveSteps

  const stepDraftPending = useMemo(() => {
    const pending: Record<string, boolean> = {}
    for (const step of steps) {
      pending[step.stepId] = stepHasUnsavedBilingualChanges(uiState.stepEditorDrafts[step.stepId])
    }
    return pending
  }, [steps, uiState.stepEditorDrafts])

  const capabilities = useMemo(
    () => getStepBoundaryCapabilities(uiState.authoring, stepDraftPending),
    [uiState.authoring, stepDraftPending],
  )

  const splitByKey = useMemo(() => {
    const map = new Map<string, (typeof capabilities.splitAfterField)[number]>()
    for (const entry of capabilities.splitAfterField) {
      map.set(`${entry.stepId}:${entry.fieldId}`, entry)
    }
    return map
  }, [capabilities])

  const boundaryByPrevious = useMemo(() => {
    const map = new Map<string, (typeof capabilities.boundaries)[number]>()
    for (const entry of capabilities.boundaries) {
      map.set(entry.previousStepId, entry)
    }
    return map
  }, [capabilities])

  useEffect(() => {
    const request = uiState.pendingFocusStep
    if (request === null || request.requestId === focusAppliedRef.current) {
      return
    }
    // Defer past FormRenderer mount/heading-focus effects (and survive StrictMode
    // effect re-entry by cancelling on cleanup). Authoring focus must win.
    const timer = window.setTimeout(() => {
      const el = document.getElementById(stepCardId(request.stepId))
      if (!(el instanceof HTMLElement)) {
        return
      }
      el.focus()
      focusAppliedRef.current = request.requestId
    }, 0)
    return () => window.clearTimeout(timer)
  }, [uiState.pendingFocusStep])

  const alertKey =
    uiState.stepsActionAlertCode !== null
      ? (STEPS_ALERT_MESSAGE[uiState.stepsActionAlertCode] ?? 'stepsAlertGeneric')
      : null

  const stepCount = capabilities.progressiveEnabled ? capabilities.stepCount : 0
  const stepUnitKey: BuilderMessageKey = stepCount === 1 ? 'stepsUnitOne' : 'stepsUnitMany'

  return (
    <div className="dg20-builder-steps">
      <h3 id="dg20-builder-steps-heading" className="dg20-builder-steps__heading">
        {builderMessage(locale, 'stepsHeading')}
      </h3>
      <p className="dg20-builder-steps__guidance">{builderMessage(locale, 'stepsGuidance')}</p>

      <p className="dg20-builder-steps__status" aria-live="polite">
        {capabilities.progressiveEnabled
          ? builderMessage(locale, 'stepsStatusProgressive')
          : builderMessage(locale, 'stepsStatusSinglePage')}
      </p>

      <p className="dg20-builder-steps__summary">
        {builderMessage(locale, 'stepsCountSummary', {
          stepCount,
          stepUnit: builderMessage(locale, stepUnitKey),
          fieldCount: capabilities.fieldCount,
        })}
      </p>

      {alertKey !== null ? (
        <p role="alert" className="dg20-builder-steps__alert" id="dg20-builder-steps-alert">
          {builderMessage(locale, alertKey)}
        </p>
      ) : null}

      {capabilities.canEnableProgressive ? (
        <button
          type="button"
          className="dg20-builder-field-action-btn"
          onClick={() => {
            onClearAlert()
            onEnableProgressive()
          }}
        >
          {builderMessage(locale, 'stepsEnable')}
        </button>
      ) : null}

      {capabilities.progressiveEnabled ? (
        <ol className="dg20-builder-steps__list" aria-labelledby="dg20-builder-steps-heading">
          {steps.map((step, stepIndex) => {
            const stepNumber = stepIndex + 1
            const boundary = boundaryByPrevious.get(step.stepId)
            return (
              <li key={step.stepId} className="dg20-builder-steps__item">
                <article
                  id={stepCardId(step.stepId)}
                  className="dg20-builder-steps__card"
                  tabIndex={-1}
                  aria-labelledby={`dg20-builder-steps-title-${step.stepId}`}
                >
                  <header className="dg20-builder-steps__card-header">
                    <h4
                      id={`dg20-builder-steps-title-${step.stepId}`}
                      className="dg20-builder-steps__card-title"
                    >
                      {builderMessage(locale, 'stepsStepHeading', { number: stepNumber })}
                    </h4>
                    <p className="dg20-builder-steps__card-meta">
                      {builderMessage(locale, 'stepsStepMeta', {
                        stepId: step.stepId,
                        labelEn: step.labelEn,
                        labelGu: step.labelGu,
                      })}
                    </p>
                    <button
                      type="button"
                      className="dg20-builder-field-action-btn"
                      aria-label={builderMessage(locale, 'stepsEditLabelsAria', {
                        stepNumber,
                      })}
                      onClick={() => onEditStepLabels(step.stepId)}
                    >
                      {builderMessage(locale, 'stepsEditLabels')}
                    </button>
                  </header>

                  <ol className="dg20-builder-steps__fields">
                    {step.fieldIds.map((fieldId) => {
                      const meta = fieldLabel(uiState, fieldId)
                      const split = splitByKey.get(`${step.stepId}:${fieldId}`)
                      const canSplit = split?.canSplitAfter === true
                      return (
                        <li key={fieldId} className="dg20-builder-steps__field">
                          <div className="dg20-builder-steps__field-row">
                            <span className="dg20-builder-steps__field-meta">
                              {builderMessage(locale, 'stepsFieldMeta', {
                                label: meta.label,
                                fieldId,
                                widgetType: meta.widgetType,
                              })}
                            </span>
                            {split !== undefined ? (
                              <div className="dg20-builder-steps__field-actions">
                                <button
                                  type="button"
                                  className="dg20-builder-field-action-btn"
                                  disabled={!canSplit}
                                  aria-label={builderMessage(locale, 'stepsSplitAfterAria', {
                                    label: meta.label,
                                    stepNumber,
                                  })}
                                  title={
                                    !canSplit
                                      ? builderMessage(locale, 'stepsBlockedSplitLast')
                                      : undefined
                                  }
                                  onClick={() => {
                                    if (!canSplit) return
                                    onClearAlert()
                                    onSplitAfterField(step.stepId, fieldId)
                                  }}
                                >
                                  {builderMessage(locale, 'stepsSplitAfter')}
                                </button>
                                {!canSplit ? (
                                  <p className="dg20-builder-steps__blocked">
                                    {builderMessage(locale, 'stepsBlockedSplitLast')}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </article>

                {boundary !== undefined ? (
                  <div
                    className="dg20-builder-steps__boundary"
                    role="group"
                    aria-label={builderMessage(locale, 'stepsBoundaryHeading', {
                      previousNumber: stepNumber,
                      nextNumber: stepNumber + 1,
                    })}
                  >
                    <button
                      type="button"
                      className="dg20-builder-field-action-btn"
                      disabled={!boundary.canMoveEarlier}
                      aria-label={builderMessage(locale, 'stepsMoveEarlierAria', {
                        previousNumber: stepNumber,
                        nextNumber: stepNumber + 1,
                      })}
                      title={
                        !boundary.canMoveEarlier
                          ? builderMessage(locale, 'stepsBlockedMoveEmpty')
                          : undefined
                      }
                      onClick={() => {
                        if (!boundary.canMoveEarlier) return
                        onClearAlert()
                        onMoveBoundary(step.stepId, 'earlier')
                      }}
                    >
                      {builderMessage(locale, 'stepsMoveEarlier')}
                    </button>
                    <button
                      type="button"
                      className="dg20-builder-field-action-btn"
                      disabled={!boundary.canMoveLater}
                      aria-label={builderMessage(locale, 'stepsMoveLaterAria', {
                        previousNumber: stepNumber,
                        nextNumber: stepNumber + 1,
                      })}
                      title={
                        !boundary.canMoveLater
                          ? builderMessage(locale, 'stepsBlockedMoveEmpty')
                          : undefined
                      }
                      onClick={() => {
                        if (!boundary.canMoveLater) return
                        onClearAlert()
                        onMoveBoundary(step.stepId, 'later')
                      }}
                    >
                      {builderMessage(locale, 'stepsMoveLater')}
                    </button>
                    <button
                      type="button"
                      className="dg20-builder-field-action-btn"
                      disabled={!boundary.canMerge}
                      aria-label={builderMessage(locale, 'stepsMergeAria', {
                        previousNumber: stepNumber,
                        nextNumber: stepNumber + 1,
                      })}
                      title={
                        !boundary.canMerge
                          ? builderMessage(locale, 'stepsBlockedMergeUnsaved')
                          : undefined
                      }
                      onClick={() => {
                        onClearAlert()
                        onMergeBoundary(step.stepId)
                      }}
                    >
                      {builderMessage(locale, 'stepsMerge')}
                    </button>
                    {!boundary.canMoveEarlier || !boundary.canMoveLater ? (
                      <p className="dg20-builder-steps__blocked">
                        {builderMessage(locale, 'stepsBlockedMoveEmpty')}
                      </p>
                    ) : null}
                    {!boundary.canMerge ? (
                      <p className="dg20-builder-steps__blocked">
                        {builderMessage(locale, 'stepsBlockedMergeUnsaved')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}

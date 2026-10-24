import type { ValidationIssue, ValidationResult } from '@dg20/form-contract'
import type { RefObject } from 'react'

import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import type { DefinitionPersistenceViewState } from '../persistence/index.js'
import type { DefinitionValidationViewState } from '../validation/index.js'
import type { DefinitionLifecyclePhase } from '../lifecycle/index.js'
import { OpenDraftPanel } from './OpenDraftPanel.js'

export interface BuilderActionsProps {
  readonly locale: BuilderLocale
  readonly validation: DefinitionValidationViewState
  readonly persistence: DefinitionPersistenceViewState
  readonly lifecycle: {
    readonly phase: DefinitionLifecyclePhase
    readonly canSubmit: boolean
    readonly submitBusy: boolean
    readonly canRetry: boolean
    readonly missingActorGuidance: boolean
  }
  readonly definitionStatus: 'draft' | 'submitted' | 'approved' | 'published' | 'retired'
  readonly onValidate: () => void
  readonly onSaveDraft: () => void
  readonly onLoad: (serviceId: string, versionText: string) => void
  readonly onConfirmDiscard: () => void
  readonly onCancelDiscard: () => void
  readonly onPersistRetry: () => void
  readonly onSubmit: () => void
  readonly onSubmitRetry: () => void
  readonly summaryRef: RefObject<HTMLDivElement | null>
  readonly persistSummaryRef: RefObject<HTMLDivElement | null>
  readonly lifecycleSummaryRef: RefObject<HTMLDivElement | null>
}

function countBySeverity(result: ValidationResult): {
  readonly errors: number
  readonly warnings: number
  readonly infos: number
} {
  let errors = 0
  let warnings = 0
  let infos = 0
  for (const issue of result.issues) {
    if (issue.severity === 'error') {
      errors += 1
    } else if (issue.severity === 'warning') {
      warnings += 1
    } else {
      infos += 1
    }
  }
  return { errors, warnings, infos }
}

function severityLabel(locale: BuilderLocale, severity: ValidationIssue['severity']): string {
  if (severity === 'error') {
    return builderMessage(locale, 'validationSeverityError')
  }
  if (severity === 'warning') {
    return builderMessage(locale, 'validationSeverityWarning')
  }
  return builderMessage(locale, 'validationSeverityInfo')
}

function IssueList({
  locale,
  issues,
}: {
  readonly locale: BuilderLocale
  readonly issues: readonly ValidationIssue[]
}) {
  return (
    <ol className="dg20-builder-validation__issues">
      {issues.map((issue, index) => (
        <li
          key={`${issue.code}:${issue.path ?? ''}:${index}`}
          className={`dg20-builder-validation__issue dg20-builder-validation__issue--${issue.severity}`}
        >
          <span className="dg20-builder-validation__issue-severity">
            {severityLabel(locale, issue.severity)}
          </span>
          <span className="dg20-builder-validation__issue-code">{issue.code}</span>
          {issue.path ? (
            <span className="dg20-builder-validation__issue-path">{issue.path}</span>
          ) : null}
          <span className="dg20-builder-validation__issue-message">{issue.message}</span>
        </li>
      ))}
    </ol>
  )
}

export function BuilderActions({
  locale,
  validation,
  persistence,
  lifecycle,
  definitionStatus,
  onValidate,
  onSaveDraft,
  onLoad,
  onConfirmDiscard,
  onCancelDiscard,
  onPersistRetry,
  onSubmit,
  onSubmitRetry,
  summaryRef,
  persistSummaryRef,
  lifecycleSummaryRef,
}: BuilderActionsProps) {
  const { phase, result, blockedByUnsavedDraft, canValidate, canRetry } = validation
  const validating = phase === 'validating'
  const validateDisabled = !canValidate && !canRetry
  const showRetry = phase === 'failed'

  const counts = result ? countBySeverity(result) : null
  const hasAdvisories =
    phase === 'valid' && result !== null && result.issues.length > 0 && counts !== null

  const saving = persistence.saveBusy
  const saveLabel =
    saving && persistence.binding.kind === 'local'
      ? builderMessage(locale, 'persistCreating')
      : saving
        ? builderMessage(locale, 'persistSaving')
        : builderMessage(locale, 'actionSaveDraft')

  return (
    <div className="dg20-builder-actions">
      <OpenDraftPanel
        locale={locale}
        persistence={persistence}
        onLoad={onLoad}
        onConfirmDiscard={onConfirmDiscard}
        onCancelDiscard={onCancelDiscard}
        onRetry={onPersistRetry}
        summaryRef={persistSummaryRef}
      />

      <div className="dg20-builder-actions__buttons">
        <button
          type="button"
          className="dg20-builder-action-btn"
          disabled={validateDisabled}
          aria-busy={validating || undefined}
          aria-describedby={
            blockedByUnsavedDraft
              ? 'dg20-builder-validation-unsaved'
              : 'dg20-builder-validation-scope'
          }
          onClick={onValidate}
        >
          {showRetry
            ? builderMessage(locale, 'validationRetry')
            : validating
              ? builderMessage(locale, 'validationValidating')
              : builderMessage(locale, 'actionValidate')}
        </button>
        <button
          type="button"
          className="dg20-builder-action-btn"
          disabled={!persistence.canSave}
          aria-busy={saving || undefined}
          aria-describedby={
            blockedByUnsavedDraft
              ? 'dg20-builder-persist-unsaved'
              : phase !== 'valid'
                ? 'dg20-builder-persist-need-validate'
                : undefined
          }
          onClick={onSaveDraft}
          data-testid="save-draft-button"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          className="dg20-builder-action-btn"
          disabled={!lifecycle.canSubmit || lifecycle.submitBusy}
          aria-busy={lifecycle.submitBusy || undefined}
          onClick={lifecycle.canRetry ? onSubmitRetry : onSubmit}
          data-testid="submit-button"
        >
          {lifecycle.submitBusy
            ? builderMessage(locale, 'actionSubmitting')
            : lifecycle.canRetry
              ? builderMessage(locale, 'submitRetry')
              : builderMessage(locale, 'actionSubmit')}
        </button>
      </div>

      <p id="dg20-builder-validation-scope" className="dg20-builder-actions__note">
        {builderMessage(locale, 'validationScopeNote')}
      </p>

      {blockedByUnsavedDraft ? (
        <p
          id="dg20-builder-validation-unsaved"
          className="dg20-builder-validation__blocked"
          role="status"
        >
          {builderMessage(locale, 'validationBlockedUnsaved')}
        </p>
      ) : null}
      {definitionStatus !== 'draft' ? (
        <p className="dg20-builder-validation__blocked" role="status">
          {builderMessage(locale, 'validateBlockedSubmitted')}
        </p>
      ) : null}
      {lifecycle.missingActorGuidance ? (
        <p className="dg20-builder-validation__blocked" role="status">
          {builderMessage(locale, 'submitBlockedActor')}
        </p>
      ) : null}

      {blockedByUnsavedDraft ? (
        <p
          id="dg20-builder-persist-unsaved"
          className="dg20-builder-validation__blocked"
          role="status"
        >
          {builderMessage(locale, 'persistSaveBlockedUnsaved')}
        </p>
      ) : null}

      {!blockedByUnsavedDraft && phase !== 'valid' && persistence.definitionDirty ? (
        <p
          id="dg20-builder-persist-need-validate"
          className="dg20-builder-validation__blocked"
          role="status"
        >
          {builderMessage(locale, 'persistSaveBlockedValidate')}
        </p>
      ) : null}

      {validating ? (
        <p className="dg20-builder-validation__status" role="status" aria-live="polite">
          {builderMessage(locale, 'validationValidating')}
        </p>
      ) : null}

      {saving ? (
        <p className="dg20-builder-validation__status" role="status" aria-live="polite">
          {persistence.binding.kind === 'local'
            ? builderMessage(locale, 'persistCreating')
            : builderMessage(locale, 'persistSaving')}
        </p>
      ) : null}

      {persistence.phase === 'saved' && persistence.lastSuccessKind !== null ? (
        <p
          className="dg20-builder-validation__status"
          role="status"
          aria-live="polite"
          data-testid="persist-success"
        >
          {persistence.lastSuccessKind === 'created'
            ? builderMessage(locale, 'persistCreated')
            : persistence.lastSuccessKind === 'loaded'
              ? builderMessage(locale, 'persistLoaded')
              : builderMessage(locale, 'persistSaved')}
        </p>
      ) : null}

      {persistence.phase === 'discarded' && persistence.currentOperation !== 'load' ? (
        <p
          className="dg20-builder-validation__status"
          role="status"
          aria-live="polite"
          data-testid="persist-save-discarded"
        >
          {builderMessage(locale, 'persistSaveDiscarded')}
        </p>
      ) : null}

      {phase === 'valid' && result && counts && !hasAdvisories ? (
        <p className="dg20-builder-validation__status" role="status" aria-live="polite">
          {builderMessage(locale, 'validationSuccess')}
        </p>
      ) : null}

      {hasAdvisories ? (
        <div
          id="dg20-builder-validation-advisories"
          className="dg20-builder-validation__advisories"
          role="status"
          aria-live="polite"
        >
          <p className="dg20-builder-validation__summary-title">
            {builderMessage(locale, 'validationValidAdvisorySummary', {
              warnings: counts.warnings,
              infos: counts.infos,
            })}
          </p>
          <IssueList locale={locale} issues={result.issues} />
        </div>
      ) : null}

      {phase === 'invalid' && result && counts ? (
        <div
          ref={summaryRef}
          id="dg20-builder-validation-summary"
          className="dg20-builder-validation__summary"
          role="alert"
          tabIndex={-1}
        >
          <p className="dg20-builder-validation__summary-title">
            {builderMessage(locale, 'validationInvalidSummary', {
              errors: counts.errors,
              warnings: counts.warnings,
              infos: counts.infos,
            })}
          </p>
          <IssueList locale={locale} issues={result.issues} />
        </div>
      ) : null}

      {phase === 'failed' ? (
        <div
          ref={summaryRef}
          id="dg20-builder-validation-failed"
          className="dg20-builder-validation__failed"
          role="alert"
          tabIndex={-1}
        >
          <p>{builderMessage(locale, 'validationFailed')}</p>
        </div>
      ) : null}

      {persistence.phase === 'duplicate' && persistence.failureSurface === 'save' ? (
        <div
          ref={persistSummaryRef}
          id="dg20-builder-persist-duplicate"
          className="dg20-builder-persist__alert"
          role="alert"
          tabIndex={-1}
        >
          <p>{builderMessage(locale, 'persistDuplicate')}</p>
        </div>
      ) : null}

      {persistence.phase === 'stale' && persistence.failureSurface === 'save' ? (
        <div
          ref={persistSummaryRef}
          id="dg20-builder-persist-stale"
          className="dg20-builder-persist__alert"
          role="alert"
          tabIndex={-1}
        >
          <p>{builderMessage(locale, 'persistStale')}</p>
        </div>
      ) : null}

      {persistence.phase === 'failed' && persistence.failureSurface === 'save' ? (
        <div
          ref={persistSummaryRef}
          id="dg20-builder-persist-failed"
          className="dg20-builder-persist__alert"
          role="alert"
          tabIndex={-1}
          data-testid="persist-save-failed"
        >
          <p>{builderMessage(locale, 'persistFailed')}</p>
        </div>
      ) : null}

      {lifecycle.phase === 'submitted' ? (
        <p
          ref={lifecycleSummaryRef}
          className="dg20-builder-validation__status"
          role="status"
          data-testid="submit-success"
        >
          {builderMessage(locale, 'submitSuccess')}
        </p>
      ) : null}
      {lifecycle.phase === 'failed' || lifecycle.phase === 'stale' ? (
        <div
          ref={lifecycleSummaryRef}
          className="dg20-builder-persist__alert"
          role="alert"
          tabIndex={-1}
        >
          <p>
            {builderMessage(locale, lifecycle.phase === 'stale' ? 'submitStale' : 'submitFailed')}
          </p>
        </div>
      ) : null}
      <p className="dg20-builder-actions__note">{builderMessage(locale, 'actionsLifecycleNote')}</p>
    </div>
  )
}

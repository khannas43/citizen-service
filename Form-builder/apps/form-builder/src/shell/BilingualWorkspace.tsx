import type { BuilderLocale, BuilderMessageKey } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import type {
  AuthoringUiState,
  BilingualIssue,
  FieldBilingualContent,
  StepBilingualContent,
} from '../authoring/index.js'
import {
  collectVisibleBilingualDrafts,
  computeBilingualCompleteness,
  isFieldBilingualEditorDirty,
  isStepEditorDirty,
  validateFieldBilingualDraft,
  validateStepBilingualDraft,
} from '../authoring/index.js'

const ISSUE_MESSAGE: Record<BilingualIssue['code'], BuilderMessageKey> = {
  label_en_required: 'editorErrorLabelEnRequired',
  label_gu_required: 'editorErrorLabelGuRequired',
  label_en_padded: 'editorErrorLabelEnPadded',
  label_gu_padded: 'editorErrorLabelGuPadded',
  help_pair_incomplete: 'editorErrorHelpPairIncomplete',
  help_en_padded: 'editorErrorHelpEnPadded',
  help_gu_padded: 'editorErrorHelpGuPadded',
  help_required: 'editorErrorHelpRequired',
  error_pair_incomplete: 'editorErrorErrorPairIncomplete',
  error_en_padded: 'editorErrorErrorEnPadded',
  error_gu_padded: 'editorErrorErrorGuPadded',
  step_label_en_required: 'editorErrorLabelEnRequired',
  step_label_gu_required: 'editorErrorLabelGuRequired',
  step_label_en_padded: 'editorErrorLabelEnPadded',
  step_label_gu_padded: 'editorErrorLabelGuPadded',
}

export interface BilingualWorkspaceProps {
  readonly locale: BuilderLocale
  readonly uiState: AuthoringUiState
  readonly onPatchField: (
    fieldId: string,
    patch: Readonly<{
      labelEn?: string
      labelGu?: string
      helpEn?: string
      helpGu?: string
      errorEn?: string
      errorGu?: string
    }>,
  ) => void
  readonly onApplyField: (fieldId: string) => void
  readonly onCancelField: (fieldId: string) => void
  readonly onPatchStep: (
    stepId: string,
    patch: Readonly<Partial<Pick<StepBilingualContent, 'labelEn' | 'labelGu'>>>,
  ) => void
  readonly onApplyStep: (stepId: string) => void
  readonly onCancelStep: (stepId: string) => void
}

function fieldControlId(fieldId: string, control: string): string {
  return `dg20-builder-bilingual-field-${fieldId}-${control}`
}

function fieldErrorId(fieldId: string, control: string): string {
  return `${fieldControlId(fieldId, control)}-error`
}

function stepControlId(stepId: string, control: string): string {
  return `dg20-builder-bilingual-step-${stepId}-${control}`
}

function stepErrorId(stepId: string, control: string): string {
  return `${stepControlId(stepId, control)}-error`
}

function fieldRowComplete(field: FieldBilingualContent): boolean {
  const validation = validateFieldBilingualDraft(field)
  return validation.ok
}

function stepRowComplete(step: StepBilingualContent): boolean {
  return validateStepBilingualDraft(step).ok
}

export function BilingualWorkspace({
  locale,
  uiState,
  onPatchField,
  onApplyField,
  onCancelField,
  onPatchStep,
  onApplyStep,
  onCancelStep,
}: BilingualWorkspaceProps) {
  const { fields, steps } = collectVisibleBilingualDrafts(uiState)
  const completeness = computeBilingualCompleteness(fields, steps)

  return (
    <div className="dg20-builder-bilingual">
      <h3 className="dg20-builder-bilingual__heading">
        {builderMessage(locale, 'bilingualHeading')}
      </h3>
      <p className="dg20-builder-bilingual__guidance">
        {builderMessage(locale, 'bilingualGuidance')}
      </p>

      <div
        className="dg20-builder-bilingual__meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completeness.percentage}
        aria-label={builderMessage(locale, 'bilingualCompletenessMeter')}
      >
        <div
          className="dg20-builder-bilingual__meter-fill"
          style={{ width: `${completeness.percentage}%` }}
        />
        <p className="dg20-builder-bilingual__meter-text">
          {builderMessage(locale, 'bilingualCompleteness', {
            complete: completeness.completePairs,
            active: completeness.activePairs,
            percentage: completeness.percentage,
          })}
        </p>
      </div>

      <section
        className="dg20-builder-bilingual__section"
        aria-labelledby="dg20-builder-bilingual-fields-heading"
      >
        <h4
          id="dg20-builder-bilingual-fields-heading"
          className="dg20-builder-bilingual__section-title"
        >
          {builderMessage(locale, 'bilingualFieldsHeading')}
        </h4>
        {fields.map((field) => {
          const entry = uiState.editorDrafts[field.fieldId]
          const showValidation = entry?.bilingualShowValidation ?? false
          const showStale = entry?.bilingualShowStaleGuidance ?? false
          const dirty = isFieldBilingualEditorDirty(uiState, field.fieldId)
          const complete = fieldRowComplete(field)
          const validation = validateFieldBilingualDraft(field)
          const issues = validation.ok ? [] : validation.issues
          const issueByControl = new Map(issues.map((issue) => [issue.control, issue]))

          const invalid = (control: string): boolean =>
            showValidation && issueByControl.has(control)
          const describedBy = (control: string): string | undefined => {
            if (!showValidation || !issueByControl.has(control)) return undefined
            return fieldErrorId(field.fieldId, control)
          }
          const renderError = (control: string) => {
            const issue = issueByControl.get(control)
            if (!showValidation || !issue) return null
            return (
              <p
                id={fieldErrorId(field.fieldId, control)}
                className="dg20-builder-editor__error"
                role="presentation"
              >
                {builderMessage(locale, ISSUE_MESSAGE[issue.code])}
              </p>
            )
          }

          return (
            <article
              key={field.fieldId}
              className="dg20-builder-bilingual__card"
              data-bilingual-field={field.fieldId}
            >
              <header className="dg20-builder-bilingual__card-header">
                <p className="dg20-builder-bilingual__meta">
                  {builderMessage(locale, 'bilingualFieldMeta', {
                    label: field.labelEn || field.fieldId,
                    widgetType: field.widgetType,
                    fieldId: field.fieldId,
                  })}
                </p>
                <div className="dg20-builder-bilingual__chips" aria-live="polite">
                  {dirty ? (
                    <span className="dg20-builder-chip dg20-builder-chip--dirty">
                      {builderMessage(locale, 'bilingualDirty')}
                    </span>
                  ) : null}
                  <span
                    className={
                      complete
                        ? 'dg20-builder-chip dg20-builder-chip--complete'
                        : 'dg20-builder-chip dg20-builder-chip--incomplete'
                    }
                  >
                    {builderMessage(locale, complete ? 'bilingualComplete' : 'bilingualIncomplete')}
                  </span>
                </div>
              </header>

              {showStale && (
                <div
                  id={`dg20-builder-bilingual-summary-${field.fieldId}`}
                  className="dg20-builder-editor__summary"
                  role="alert"
                  tabIndex={-1}
                >
                  <p className="dg20-builder-editor__summary-title">
                    {builderMessage(locale, 'editorStaleGuidance')}
                  </p>
                </div>
              )}

              {showValidation && issues.length > 0 && (
                <div
                  id={`dg20-builder-bilingual-summary-${field.fieldId}`}
                  className="dg20-builder-editor__summary"
                  role="alert"
                  tabIndex={-1}
                >
                  <p className="dg20-builder-editor__summary-title">
                    {builderMessage(locale, 'editorValidationSummary')}
                  </p>
                  <ul>
                    {issues.map((issue) => (
                      <li key={`${issue.control}-${issue.code}`}>
                        {builderMessage(locale, ISSUE_MESSAGE[issue.code])}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="dg20-builder-bilingual__columns">
                <div className="dg20-builder-bilingual__column">
                  <h5 className="dg20-builder-bilingual__column-title">
                    {builderMessage(locale, 'bilingualColumnEn')}
                  </h5>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={fieldControlId(field.fieldId, 'labelEn')}
                    >
                      {builderMessage(locale, 'editorLabelEn')}
                    </label>
                    <input
                      id={fieldControlId(field.fieldId, 'labelEn')}
                      className="dg20-builder-search-input"
                      type="text"
                      value={field.labelEn}
                      aria-invalid={invalid('labelEn') || undefined}
                      aria-describedby={describedBy('labelEn')}
                      onChange={(event) =>
                        onPatchField(field.fieldId, { labelEn: event.target.value })
                      }
                    />
                    {renderError('labelEn')}
                  </div>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={fieldControlId(field.fieldId, 'helpEn')}
                    >
                      {builderMessage(
                        locale,
                        field.widgetType === 'info-panel' ||
                          field.widgetType === 'eligibility-declaration'
                          ? 'editorHelpEnRequired'
                          : 'editorHelpEn',
                      )}
                    </label>
                    <textarea
                      id={fieldControlId(field.fieldId, 'helpEn')}
                      className="dg20-builder-editor__textarea"
                      rows={2}
                      value={field.helpEn}
                      aria-invalid={invalid('helpEn') || undefined}
                      aria-describedby={describedBy('helpEn')}
                      onChange={(event) =>
                        onPatchField(field.fieldId, { helpEn: event.target.value })
                      }
                    />
                    {renderError('helpEn')}
                  </div>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={fieldControlId(field.fieldId, 'errorEn')}
                    >
                      {builderMessage(locale, 'bilingualErrorEn')}
                    </label>
                    <textarea
                      id={fieldControlId(field.fieldId, 'errorEn')}
                      className="dg20-builder-editor__textarea"
                      rows={2}
                      value={field.errorEn}
                      aria-invalid={invalid('errorEn') || undefined}
                      aria-describedby={describedBy('errorEn')}
                      onChange={(event) =>
                        onPatchField(field.fieldId, { errorEn: event.target.value })
                      }
                    />
                    {renderError('errorEn')}
                  </div>
                </div>

                <div className="dg20-builder-bilingual__column">
                  <h5 className="dg20-builder-bilingual__column-title">
                    {builderMessage(locale, 'bilingualColumnGu')}
                  </h5>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={fieldControlId(field.fieldId, 'labelGu')}
                    >
                      {builderMessage(locale, 'editorLabelGu')}
                    </label>
                    <input
                      id={fieldControlId(field.fieldId, 'labelGu')}
                      className="dg20-builder-search-input"
                      type="text"
                      value={field.labelGu}
                      aria-invalid={invalid('labelGu') || undefined}
                      aria-describedby={describedBy('labelGu')}
                      onChange={(event) =>
                        onPatchField(field.fieldId, { labelGu: event.target.value })
                      }
                    />
                    {renderError('labelGu')}
                  </div>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={fieldControlId(field.fieldId, 'helpGu')}
                    >
                      {builderMessage(
                        locale,
                        field.widgetType === 'info-panel' ||
                          field.widgetType === 'eligibility-declaration'
                          ? 'editorHelpGuRequired'
                          : 'editorHelpGu',
                      )}
                    </label>
                    <textarea
                      id={fieldControlId(field.fieldId, 'helpGu')}
                      className="dg20-builder-editor__textarea"
                      rows={2}
                      value={field.helpGu}
                      aria-invalid={invalid('helpGu') || undefined}
                      aria-describedby={describedBy('helpGu')}
                      onChange={(event) =>
                        onPatchField(field.fieldId, { helpGu: event.target.value })
                      }
                    />
                    {renderError('helpGu')}
                  </div>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={fieldControlId(field.fieldId, 'errorGu')}
                    >
                      {builderMessage(locale, 'bilingualErrorGu')}
                    </label>
                    <textarea
                      id={fieldControlId(field.fieldId, 'errorGu')}
                      className="dg20-builder-editor__textarea"
                      rows={2}
                      value={field.errorGu}
                      aria-invalid={invalid('errorGu') || undefined}
                      aria-describedby={describedBy('errorGu')}
                      onChange={(event) =>
                        onPatchField(field.fieldId, { errorGu: event.target.value })
                      }
                    />
                    {renderError('errorGu')}
                  </div>
                </div>
              </div>

              <div className="dg20-builder-bilingual__actions">
                <button
                  type="button"
                  className="dg20-builder-field-action-btn"
                  onClick={() => onApplyField(field.fieldId)}
                  disabled={!dirty}
                >
                  {builderMessage(locale, 'bilingualApply')}
                </button>
                <button
                  type="button"
                  className="dg20-builder-field-action-btn"
                  onClick={() => onCancelField(field.fieldId)}
                  disabled={!dirty && !showValidation && !showStale}
                >
                  {builderMessage(locale, 'bilingualCancel')}
                </button>
              </div>
            </article>
          )
        })}
      </section>

      <section
        className="dg20-builder-bilingual__section"
        aria-labelledby="dg20-builder-bilingual-steps-heading"
      >
        <h4
          id="dg20-builder-bilingual-steps-heading"
          className="dg20-builder-bilingual__section-title"
        >
          {builderMessage(locale, 'bilingualStepsHeading')}
        </h4>
        {steps.map((step) => {
          const entry = uiState.stepEditorDrafts[step.stepId]
          const showValidation = entry?.showValidation ?? false
          const showStale = entry?.showStaleGuidance ?? false
          const dirty = isStepEditorDirty(uiState, step.stepId)
          const complete = stepRowComplete(step)
          const validation = validateStepBilingualDraft(step)
          const issues = validation.ok ? [] : validation.issues
          const issueByControl = new Map(issues.map((issue) => [issue.control, issue]))

          const invalid = (control: string): boolean =>
            showValidation && issueByControl.has(control)
          const describedBy = (control: string): string | undefined => {
            if (!showValidation || !issueByControl.has(control)) return undefined
            return stepErrorId(step.stepId, control)
          }
          const renderError = (control: string) => {
            const issue = issueByControl.get(control)
            if (!showValidation || !issue) return null
            return (
              <p
                id={stepErrorId(step.stepId, control)}
                className="dg20-builder-editor__error"
                role="presentation"
              >
                {builderMessage(locale, ISSUE_MESSAGE[issue.code])}
              </p>
            )
          }

          return (
            <article
              key={step.stepId}
              className="dg20-builder-bilingual__card"
              data-bilingual-step={step.stepId}
            >
              <header className="dg20-builder-bilingual__card-header">
                <p className="dg20-builder-bilingual__meta">{step.stepId}</p>
                <div className="dg20-builder-bilingual__chips" aria-live="polite">
                  {dirty ? (
                    <span className="dg20-builder-chip dg20-builder-chip--dirty">
                      {builderMessage(locale, 'bilingualDirty')}
                    </span>
                  ) : null}
                  <span
                    className={
                      complete
                        ? 'dg20-builder-chip dg20-builder-chip--complete'
                        : 'dg20-builder-chip dg20-builder-chip--incomplete'
                    }
                  >
                    {builderMessage(locale, complete ? 'bilingualComplete' : 'bilingualIncomplete')}
                  </span>
                </div>
              </header>

              {showStale && (
                <div
                  id={`dg20-builder-bilingual-step-summary-${step.stepId}`}
                  className="dg20-builder-editor__summary"
                  role="alert"
                  tabIndex={-1}
                >
                  <p className="dg20-builder-editor__summary-title">
                    {builderMessage(locale, 'editorStaleGuidance')}
                  </p>
                </div>
              )}

              {showValidation && issues.length > 0 && (
                <div
                  id={`dg20-builder-bilingual-step-summary-${step.stepId}`}
                  className="dg20-builder-editor__summary"
                  role="alert"
                  tabIndex={-1}
                >
                  <p className="dg20-builder-editor__summary-title">
                    {builderMessage(locale, 'editorValidationSummary')}
                  </p>
                  <ul>
                    {issues.map((issue) => (
                      <li key={`${issue.control}-${issue.code}`}>
                        {builderMessage(locale, ISSUE_MESSAGE[issue.code])}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="dg20-builder-bilingual__columns">
                <div className="dg20-builder-bilingual__column">
                  <h5 className="dg20-builder-bilingual__column-title">
                    {builderMessage(locale, 'bilingualColumnEn')}
                  </h5>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={stepControlId(step.stepId, 'labelEn')}
                    >
                      {builderMessage(locale, 'bilingualStepLabelEn')}
                    </label>
                    <input
                      id={stepControlId(step.stepId, 'labelEn')}
                      className="dg20-builder-search-input"
                      type="text"
                      value={step.labelEn}
                      aria-invalid={invalid('labelEn') || undefined}
                      aria-describedby={describedBy('labelEn')}
                      onChange={(event) =>
                        onPatchStep(step.stepId, { labelEn: event.target.value })
                      }
                    />
                    {renderError('labelEn')}
                  </div>
                </div>
                <div className="dg20-builder-bilingual__column">
                  <h5 className="dg20-builder-bilingual__column-title">
                    {builderMessage(locale, 'bilingualColumnGu')}
                  </h5>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={stepControlId(step.stepId, 'labelGu')}
                    >
                      {builderMessage(locale, 'bilingualStepLabelGu')}
                    </label>
                    <input
                      id={stepControlId(step.stepId, 'labelGu')}
                      className="dg20-builder-search-input"
                      type="text"
                      value={step.labelGu}
                      aria-invalid={invalid('labelGu') || undefined}
                      aria-describedby={describedBy('labelGu')}
                      onChange={(event) =>
                        onPatchStep(step.stepId, { labelGu: event.target.value })
                      }
                    />
                    {renderError('labelGu')}
                  </div>
                </div>
              </div>

              <div className="dg20-builder-bilingual__actions">
                <button
                  type="button"
                  className="dg20-builder-field-action-btn"
                  onClick={() => onApplyStep(step.stepId)}
                  disabled={!dirty}
                >
                  {builderMessage(locale, 'bilingualApply')}
                </button>
                <button
                  type="button"
                  className="dg20-builder-field-action-btn"
                  onClick={() => onCancelStep(step.stepId)}
                  disabled={!dirty && !showValidation && !showStale}
                >
                  {builderMessage(locale, 'bilingualCancel')}
                </button>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

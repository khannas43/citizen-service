import { useEffect, useId } from 'react'
import type { IntegrationDirection } from '@dg20/form-contract'

import type { BuilderLocale, BuilderMessageKey } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import type {
  AuthoringUiState,
  CafPrefillBindingIssue,
  IntegrationBindingDraftRow,
  IntegrationBindingIssue,
  WorkflowBindingDraftRow,
  WorkflowBindingIssue,
} from '../authoring/index.js'
import {
  collectBindableFields,
  collectVisibleCafBindingDrafts,
  isIntegrationBindingSurfaceDirty,
  isWorkflowBindingSurfaceDirty,
  seedIntegrationBindingDraftSurface,
  seedWorkflowBindingDraftSurface,
  validateCafPrefillBindingDraft,
  validateIntegrationBindingsDraft,
  validateWorkflowBindingsDraft,
} from '../authoring/index.js'

const CAF_ISSUE_MESSAGE: Record<CafPrefillBindingIssue['code'], BuilderMessageKey> = {
  caf_attribute_invalid: 'editorErrorCafAttributeInvalid',
  confidence_min_invalid: 'editorErrorConfidenceMinInvalid',
}

const INTEGRATION_ISSUE_MESSAGE: Record<IntegrationBindingIssue['code'], BuilderMessageKey> = {
  integration_field_invalid: 'editorErrorIntegrationFieldInvalid',
  integration_adapter_invalid: 'editorErrorIntegrationAdapterInvalid',
  integration_param_invalid: 'editorErrorIntegrationParamInvalid',
  integration_direction_invalid: 'editorErrorIntegrationDirectionInvalid',
  integration_duplicate_tuple: 'editorErrorIntegrationDuplicateTuple',
}

const WORKFLOW_ISSUE_MESSAGE: Record<WorkflowBindingIssue['code'], BuilderMessageKey> = {
  workflow_field_invalid: 'editorErrorWorkflowFieldInvalid',
  workflow_stage_invalid: 'editorErrorWorkflowStageInvalid',
  workflow_duplicate_pair: 'editorErrorWorkflowDuplicatePair',
}

export interface BindingsWorkspaceProps {
  readonly locale: BuilderLocale
  readonly uiState: AuthoringUiState
  readonly readOnly: boolean
  readonly onPatch: (
    fieldId: string,
    patch: Partial<{ cafAttribute: string; confidenceMin: string }>,
  ) => void
  readonly onApply: (fieldId: string) => void
  readonly onCancel: (fieldId: string) => void
  readonly onRemove: (fieldId: string) => void
  readonly onEnsureIntegrationDraft: () => void
  readonly onAddIntegrationRow: () => void
  readonly onPatchIntegrationRow: (
    rowKey: string,
    patch: Partial<Omit<IntegrationBindingDraftRow, 'rowKey'>>,
  ) => void
  readonly onRemoveIntegrationRow: (rowKey: string) => void
  readonly onApplyIntegration: () => void
  readonly onCancelIntegration: () => void
  readonly onEnsureWorkflowDraft: () => void
  readonly onAddWorkflowRow: () => void
  readonly onPatchWorkflowRow: (
    rowKey: string,
    patch: Partial<Omit<WorkflowBindingDraftRow, 'rowKey'>>,
  ) => void
  readonly onRemoveWorkflowRow: (rowKey: string) => void
  readonly onApplyWorkflow: () => void
  readonly onCancelWorkflow: () => void
}

function cafControlId(fieldId: string, control: 'cafAttribute' | 'confidenceMin'): string {
  return `dg20-builder-binding-${fieldId}-${control}`
}

function cafErrorId(fieldId: string, control: 'cafAttribute' | 'confidenceMin'): string {
  return `${cafControlId(fieldId, control)}-error`
}

function cafSummaryId(fieldId: string): string {
  return `dg20-builder-binding-summary-${fieldId}`
}

function integrationControlId(
  rowKey: string,
  control: 'fieldId' | 'adapterId' | 'param' | 'direction',
): string {
  return `dg20-builder-integration-${rowKey}-${control}`
}

function integrationErrorId(
  rowKey: string,
  control: 'fieldId' | 'adapterId' | 'param' | 'direction' | 'row',
): string {
  return `dg20-builder-integration-${rowKey}-${control}-error`
}

function workflowControlId(rowKey: string, control: 'fieldId' | 'stage'): string {
  return `dg20-builder-workflow-${rowKey}-${control}`
}

function workflowErrorId(rowKey: string, control: 'fieldId' | 'stage' | 'row'): string {
  return `dg20-builder-workflow-${rowKey}-${control}-error`
}

export function BindingsWorkspace({
  locale,
  uiState,
  readOnly,
  onPatch,
  onApply,
  onCancel,
  onRemove,
  onEnsureIntegrationDraft,
  onAddIntegrationRow,
  onPatchIntegrationRow,
  onRemoveIntegrationRow,
  onApplyIntegration,
  onCancelIntegration,
  onEnsureWorkflowDraft,
  onAddWorkflowRow,
  onPatchWorkflowRow,
  onRemoveWorkflowRow,
  onApplyWorkflow,
  onCancelWorkflow,
}: BindingsWorkspaceProps) {
  const instanceId = useId()
  const definition = uiState.authoring.definition
  const cafRows = collectVisibleCafBindingDrafts(definition, uiState.bindingDrafts)
  const bindableFields = collectBindableFields(definition)

  // Seed Integration/Workflow surfaces so committed rows use stable UI row keys (FB-D21).
  useEffect(() => {
    if (readOnly) return
    if (uiState.integrationBindingDraft === null) {
      onEnsureIntegrationDraft()
    }
    if (uiState.workflowBindingDraft === null) {
      onEnsureWorkflowDraft()
    }
  }, [
    readOnly,
    uiState.integrationBindingDraft,
    uiState.workflowBindingDraft,
    onEnsureIntegrationDraft,
    onEnsureWorkflowDraft,
  ])

  const integrationSurface =
    uiState.integrationBindingDraft ?? seedIntegrationBindingDraftSurface(definition)
  const integrationDirty = isIntegrationBindingSurfaceDirty(
    uiState.integrationBindingDraft,
    definition,
  )
  const integrationShowValidation = uiState.integrationBindingDraft?.showValidation ?? false
  const integrationShowStale = uiState.integrationBindingDraft?.showStaleGuidance ?? false
  const integrationValidation = validateIntegrationBindingsDraft(
    definition,
    integrationSurface.draft,
  )
  const integrationIssues = integrationValidation.ok ? [] : integrationValidation.issues
  const integrationDisplayRows = integrationSurface.draft.rows

  const workflowSurface =
    uiState.workflowBindingDraft ?? seedWorkflowBindingDraftSurface(definition)
  const workflowDirty = isWorkflowBindingSurfaceDirty(uiState.workflowBindingDraft, definition)
  const workflowShowValidation = uiState.workflowBindingDraft?.showValidation ?? false
  const workflowShowStale = uiState.workflowBindingDraft?.showStaleGuidance ?? false
  const workflowValidation = validateWorkflowBindingsDraft(definition, workflowSurface.draft)
  const workflowIssues = workflowValidation.ok ? [] : workflowValidation.issues
  const workflowDisplayRows = workflowSurface.draft.rows

  const fieldOptionLabel = (fieldId: string): string => {
    const field = bindableFields.find((entry) => entry.fieldId === fieldId)
    if (!field) return fieldId
    const label = locale === 'gu' ? field.labelGu : field.labelEn
    if (field.kind === 'nested' && field.parentRepeaterFieldId) {
      const parent = bindableFields.find((entry) => entry.fieldId === field.parentRepeaterFieldId)
      const parentLabel =
        locale === 'gu'
          ? (parent?.labelGu ?? field.parentRepeaterFieldId)
          : (parent?.labelEn ?? field.parentRepeaterFieldId)
      return builderMessage(locale, 'bindingsNestedFieldMeta', {
        label: label || fieldId,
        parent: parentLabel,
        fieldId,
      })
    }
    return builderMessage(locale, 'bindingsFieldMeta', {
      label: label || fieldId,
      fieldId,
    })
  }

  return (
    <div className="dg20-builder-bindings" data-bindings-instance={instanceId}>
      <h3 id="dg20-builder-bindings-heading" className="dg20-builder-bindings__heading">
        {builderMessage(locale, 'bindingsHeading')}
      </h3>
      <p className="dg20-builder-bindings__guidance">
        {builderMessage(locale, 'bindingsGuidance')}
      </p>
      <p className="dg20-builder-bindings__guidance">
        {builderMessage(locale, 'bindingsOpaqueIdsGuidance')}
      </p>

      <section
        className="dg20-builder-bindings__section"
        aria-labelledby="dg20-builder-bindings-caf-heading"
      >
        <h4
          id="dg20-builder-bindings-caf-heading"
          className="dg20-builder-bindings__section-heading"
        >
          {builderMessage(locale, 'bindingsCafHeading')}
        </h4>
        <p className="dg20-builder-bindings__guidance">
          {builderMessage(locale, 'bindingsCafGuidance')}
        </p>

        {cafRows.length === 0 ? (
          <p className="dg20-builder-bindings__empty">{builderMessage(locale, 'bindingsEmpty')}</p>
        ) : (
          cafRows.map((row) => {
            const showValidation = row.showValidation
            const showStale = row.showStaleGuidance
            const dirty = row.dirty
            const validation = validateCafPrefillBindingDraft(row.fieldId, row.draft)
            const issues = validation.ok ? [] : validation.issues
            const issueByControl = new Map(issues.map((issue) => [issue.control, issue]))
            const label = locale === 'gu' ? row.labelGu : row.labelEn
            const canRemove = !readOnly && (row.bound || row.committed !== null)

            const invalid = (control: 'cafAttribute' | 'confidenceMin'): boolean =>
              showValidation && issueByControl.has(control)
            const describedBy = (control: 'cafAttribute' | 'confidenceMin'): string | undefined => {
              if (!showValidation || !issueByControl.has(control)) return undefined
              return cafErrorId(row.fieldId, control)
            }
            const renderError = (control: 'cafAttribute' | 'confidenceMin') => {
              const issue = issueByControl.get(control)
              if (!showValidation || !issue) return null
              return (
                <p
                  id={cafErrorId(row.fieldId, control)}
                  className="dg20-builder-editor__error"
                  role="presentation"
                >
                  {builderMessage(locale, CAF_ISSUE_MESSAGE[issue.code])}
                </p>
              )
            }

            return (
              <article
                key={row.fieldId}
                className="dg20-builder-bindings__card"
                data-binding-field={row.fieldId}
              >
                <header className="dg20-builder-bindings__card-header">
                  <p className="dg20-builder-bindings__meta">
                    {builderMessage(locale, 'bindingsFieldMeta', {
                      label: label || row.fieldId,
                      fieldId: row.fieldId,
                    })}
                  </p>
                  <div className="dg20-builder-bindings__chips" aria-live="polite">
                    {dirty ? (
                      <span className="dg20-builder-chip dg20-builder-chip--dirty">
                        {builderMessage(locale, 'bindingsDirty')}
                      </span>
                    ) : (
                      <span className="dg20-builder-chip">
                        {builderMessage(locale, 'bindingsClean')}
                      </span>
                    )}
                    <span
                      className={
                        row.bound
                          ? 'dg20-builder-chip dg20-builder-chip--complete'
                          : 'dg20-builder-chip dg20-builder-chip--incomplete'
                      }
                    >
                      {builderMessage(
                        locale,
                        row.bound ? 'bindingsStatusBound' : 'bindingsStatusUnbound',
                      )}
                    </span>
                  </div>
                </header>

                {showStale && (
                  <div
                    id={cafSummaryId(row.fieldId)}
                    className="dg20-builder-editor__summary"
                    role="alert"
                    tabIndex={-1}
                  >
                    <p className="dg20-builder-editor__summary-title">
                      {builderMessage(locale, 'bindingsStaleGuidance')}
                    </p>
                  </div>
                )}

                {showValidation && issues.length > 0 && (
                  <div
                    id={cafSummaryId(row.fieldId)}
                    className="dg20-builder-editor__summary"
                    role="alert"
                    tabIndex={-1}
                  >
                    <p className="dg20-builder-editor__summary-title">
                      {builderMessage(locale, 'bindingsValidationSummary')}
                    </p>
                    <ul>
                      {issues.map((issue) => (
                        <li key={`${issue.control}-${issue.code}`}>
                          {builderMessage(locale, CAF_ISSUE_MESSAGE[issue.code])}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="dg20-builder-bindings__fields">
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={cafControlId(row.fieldId, 'cafAttribute')}
                    >
                      {builderMessage(locale, 'bindingsCafAttribute')}
                    </label>
                    <input
                      id={cafControlId(row.fieldId, 'cafAttribute')}
                      className="dg20-builder-search-input"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={row.draft.cafAttribute}
                      disabled={readOnly}
                      aria-invalid={invalid('cafAttribute') || undefined}
                      aria-describedby={describedBy('cafAttribute')}
                      onChange={(event) =>
                        onPatch(row.fieldId, { cafAttribute: event.target.value })
                      }
                    />
                    {renderError('cafAttribute')}
                  </div>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={cafControlId(row.fieldId, 'confidenceMin')}
                    >
                      {builderMessage(locale, 'bindingsConfidenceMin')}
                    </label>
                    <input
                      id={cafControlId(row.fieldId, 'confidenceMin')}
                      className="dg20-builder-search-input"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      spellCheck={false}
                      value={row.draft.confidenceMin}
                      disabled={readOnly}
                      aria-invalid={invalid('confidenceMin') || undefined}
                      aria-describedby={describedBy('confidenceMin')}
                      onChange={(event) =>
                        onPatch(row.fieldId, { confidenceMin: event.target.value })
                      }
                    />
                    {renderError('confidenceMin')}
                  </div>
                </div>

                <div className="dg20-builder-bindings__actions">
                  <button
                    type="button"
                    className="dg20-builder-field-action-btn"
                    onClick={() => onApply(row.fieldId)}
                    disabled={readOnly || !dirty}
                  >
                    {builderMessage(locale, 'bindingsApply')}
                  </button>
                  <button
                    type="button"
                    className="dg20-builder-field-action-btn"
                    onClick={() => onCancel(row.fieldId)}
                    disabled={readOnly || (!dirty && !showValidation && !showStale)}
                  >
                    {builderMessage(locale, 'bindingsCancel')}
                  </button>
                  {canRemove ? (
                    <button
                      type="button"
                      className="dg20-builder-field-action-btn"
                      onClick={() => onRemove(row.fieldId)}
                    >
                      {builderMessage(locale, 'bindingsRemove')}
                    </button>
                  ) : null}
                </div>
              </article>
            )
          })
        )}
      </section>

      <section
        className="dg20-builder-bindings__section"
        aria-labelledby="dg20-builder-bindings-integration-heading"
      >
        <h4
          id="dg20-builder-bindings-integration-heading"
          className="dg20-builder-bindings__section-heading"
        >
          {builderMessage(locale, 'bindingsIntegrationHeading')}
        </h4>
        <p className="dg20-builder-bindings__guidance">
          {builderMessage(locale, 'bindingsIntegrationGuidance')}
        </p>

        {integrationShowStale && (
          <div
            id="dg20-builder-integration-summary"
            className="dg20-builder-editor__summary"
            role="alert"
            tabIndex={-1}
          >
            <p className="dg20-builder-editor__summary-title">
              {builderMessage(locale, 'bindingsIntegrationStaleGuidance')}
            </p>
          </div>
        )}

        {integrationShowValidation && integrationIssues.length > 0 && (
          <div
            id="dg20-builder-integration-summary"
            className="dg20-builder-editor__summary"
            role="alert"
            tabIndex={-1}
          >
            <p className="dg20-builder-editor__summary-title">
              {builderMessage(locale, 'bindingsIntegrationValidationSummary')}
            </p>
            <ul>
              {integrationIssues.map((issue) => (
                <li key={`${issue.rowKey}-${issue.control}-${issue.code}`}>
                  {builderMessage(locale, INTEGRATION_ISSUE_MESSAGE[issue.code])}
                </li>
              ))}
            </ul>
          </div>
        )}

        {integrationDisplayRows.length === 0 ? (
          <p className="dg20-builder-bindings__empty">
            {builderMessage(locale, 'bindingsIntegrationEmpty')}
          </p>
        ) : (
          integrationDisplayRows.map((row) => {
            const issuesForRow = integrationIssues.filter((issue) => issue.rowKey === row.rowKey)
            const issueByControl = new Map(issuesForRow.map((issue) => [issue.control, issue]))
            const invalid = (control: IntegrationBindingIssue['control']): boolean =>
              integrationShowValidation && issueByControl.has(control)
            const describedBy = (
              control: IntegrationBindingIssue['control'],
            ): string | undefined => {
              if (!integrationShowValidation || !issueByControl.has(control)) return undefined
              return integrationErrorId(row.rowKey, control)
            }
            const renderError = (control: IntegrationBindingIssue['control']) => {
              const issue = issueByControl.get(control)
              if (!integrationShowValidation || !issue) return null
              return (
                <p
                  id={integrationErrorId(row.rowKey, control)}
                  className="dg20-builder-editor__error"
                  role="presentation"
                >
                  {builderMessage(locale, INTEGRATION_ISSUE_MESSAGE[issue.code])}
                </p>
              )
            }

            return (
              <article
                key={row.rowKey}
                className="dg20-builder-bindings__card"
                data-integration-row={row.rowKey}
              >
                <div className="dg20-builder-bindings__fields">
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={integrationControlId(row.rowKey, 'fieldId')}
                    >
                      {builderMessage(locale, 'bindingsFieldSelect')}
                    </label>
                    <select
                      id={integrationControlId(row.rowKey, 'fieldId')}
                      className="dg20-builder-search-input"
                      value={row.fieldId}
                      disabled={readOnly}
                      aria-invalid={invalid('fieldId') || undefined}
                      aria-describedby={describedBy('fieldId')}
                      onChange={(event) => {
                        onPatchIntegrationRow(row.rowKey, { fieldId: event.target.value })
                      }}
                    >
                      <option value="">{builderMessage(locale, 'bindingsFieldSelect')}</option>
                      {bindableFields.map((field) => (
                        <option key={field.fieldId} value={field.fieldId}>
                          {fieldOptionLabel(field.fieldId)}
                        </option>
                      ))}
                    </select>
                    {renderError('fieldId')}
                  </div>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={integrationControlId(row.rowKey, 'adapterId')}
                    >
                      {builderMessage(locale, 'bindingsIntegrationAdapterId')}
                    </label>
                    <input
                      id={integrationControlId(row.rowKey, 'adapterId')}
                      className="dg20-builder-search-input"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={row.adapterId}
                      disabled={readOnly}
                      aria-invalid={invalid('adapterId') || undefined}
                      aria-describedby={describedBy('adapterId')}
                      onChange={(event) => {
                        onPatchIntegrationRow(row.rowKey, { adapterId: event.target.value })
                      }}
                    />
                    {renderError('adapterId')}
                  </div>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={integrationControlId(row.rowKey, 'param')}
                    >
                      {builderMessage(locale, 'bindingsIntegrationParam')}
                    </label>
                    <input
                      id={integrationControlId(row.rowKey, 'param')}
                      className="dg20-builder-search-input"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={row.param}
                      disabled={readOnly}
                      aria-invalid={invalid('param') || undefined}
                      aria-describedby={describedBy('param')}
                      onChange={(event) => {
                        onPatchIntegrationRow(row.rowKey, { param: event.target.value })
                      }}
                    />
                    {renderError('param')}
                  </div>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={integrationControlId(row.rowKey, 'direction')}
                    >
                      {builderMessage(locale, 'bindingsIntegrationDirection')}
                    </label>
                    <select
                      id={integrationControlId(row.rowKey, 'direction')}
                      className="dg20-builder-search-input"
                      value={row.direction}
                      disabled={readOnly}
                      aria-invalid={invalid('direction') || undefined}
                      aria-describedby={describedBy('direction')}
                      onChange={(event) => {
                        const value = event.target.value
                        onPatchIntegrationRow(row.rowKey, {
                          direction:
                            value === 'in' || value === 'out'
                              ? value
                              : ('' as '' | IntegrationDirection),
                        })
                      }}
                    >
                      <option value="">
                        {builderMessage(locale, 'bindingsIntegrationDirection')}
                      </option>
                      <option value="in">
                        {builderMessage(locale, 'bindingsIntegrationDirectionIn')}
                      </option>
                      <option value="out">
                        {builderMessage(locale, 'bindingsIntegrationDirectionOut')}
                      </option>
                    </select>
                    {renderError('direction')}
                  </div>
                </div>
                {invalid('row') ? renderError('row') : null}
                <div className="dg20-builder-bindings__actions">
                  <button
                    type="button"
                    className="dg20-builder-field-action-btn"
                    disabled={readOnly}
                    onClick={() => {
                      onRemoveIntegrationRow(row.rowKey)
                    }}
                  >
                    {builderMessage(locale, 'bindingsIntegrationRemoveRow')}
                  </button>
                </div>
              </article>
            )
          })
        )}

        <div className="dg20-builder-bindings__actions">
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            disabled={readOnly}
            onClick={() => {
              onAddIntegrationRow()
            }}
          >
            {builderMessage(locale, 'bindingsIntegrationAdd')}
          </button>
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            onClick={onApplyIntegration}
            disabled={readOnly || !integrationDirty}
          >
            {builderMessage(locale, 'bindingsApply')}
          </button>
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            onClick={onCancelIntegration}
            disabled={
              readOnly
                ? uiState.integrationBindingDraft === null
                : !integrationDirty && !integrationShowValidation && !integrationShowStale
            }
          >
            {builderMessage(locale, 'bindingsCancel')}
          </button>
          <span className="dg20-builder-bindings__chips" aria-live="polite">
            {integrationDirty ? (
              <span className="dg20-builder-chip dg20-builder-chip--dirty">
                {builderMessage(locale, 'bindingsDirty')}
              </span>
            ) : (
              <span className="dg20-builder-chip">{builderMessage(locale, 'bindingsClean')}</span>
            )}
          </span>
        </div>
      </section>

      <section
        className="dg20-builder-bindings__section"
        aria-labelledby="dg20-builder-bindings-workflow-heading"
      >
        <h4
          id="dg20-builder-bindings-workflow-heading"
          className="dg20-builder-bindings__section-heading"
        >
          {builderMessage(locale, 'bindingsWorkflowHeading')}
        </h4>
        <p className="dg20-builder-bindings__guidance">
          {builderMessage(locale, 'bindingsWorkflowGuidance')}
        </p>

        {workflowShowStale && (
          <div
            id="dg20-builder-workflow-summary"
            className="dg20-builder-editor__summary"
            role="alert"
            tabIndex={-1}
          >
            <p className="dg20-builder-editor__summary-title">
              {builderMessage(locale, 'bindingsWorkflowStaleGuidance')}
            </p>
          </div>
        )}

        {workflowShowValidation && workflowIssues.length > 0 && (
          <div
            id="dg20-builder-workflow-summary"
            className="dg20-builder-editor__summary"
            role="alert"
            tabIndex={-1}
          >
            <p className="dg20-builder-editor__summary-title">
              {builderMessage(locale, 'bindingsWorkflowValidationSummary')}
            </p>
            <ul>
              {workflowIssues.map((issue) => (
                <li key={`${issue.rowKey}-${issue.control}-${issue.code}`}>
                  {builderMessage(locale, WORKFLOW_ISSUE_MESSAGE[issue.code])}
                </li>
              ))}
            </ul>
          </div>
        )}

        {workflowDisplayRows.length === 0 ? (
          <p className="dg20-builder-bindings__empty">
            {builderMessage(locale, 'bindingsWorkflowEmpty')}
          </p>
        ) : (
          workflowDisplayRows.map((row) => {
            const issuesForRow = workflowIssues.filter((issue) => issue.rowKey === row.rowKey)
            const issueByControl = new Map(issuesForRow.map((issue) => [issue.control, issue]))
            const invalid = (control: WorkflowBindingIssue['control']): boolean =>
              workflowShowValidation && issueByControl.has(control)
            const describedBy = (control: WorkflowBindingIssue['control']): string | undefined => {
              if (!workflowShowValidation || !issueByControl.has(control)) return undefined
              return workflowErrorId(row.rowKey, control)
            }
            const renderError = (control: WorkflowBindingIssue['control']) => {
              const issue = issueByControl.get(control)
              if (!workflowShowValidation || !issue) return null
              return (
                <p
                  id={workflowErrorId(row.rowKey, control)}
                  className="dg20-builder-editor__error"
                  role="presentation"
                >
                  {builderMessage(locale, WORKFLOW_ISSUE_MESSAGE[issue.code])}
                </p>
              )
            }

            return (
              <article
                key={row.rowKey}
                className="dg20-builder-bindings__card"
                data-workflow-row={row.rowKey}
              >
                <div className="dg20-builder-bindings__fields">
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={workflowControlId(row.rowKey, 'fieldId')}
                    >
                      {builderMessage(locale, 'bindingsFieldSelect')}
                    </label>
                    <select
                      id={workflowControlId(row.rowKey, 'fieldId')}
                      className="dg20-builder-search-input"
                      value={row.fieldId}
                      disabled={readOnly}
                      aria-invalid={invalid('fieldId') || undefined}
                      aria-describedby={describedBy('fieldId')}
                      onChange={(event) => {
                        onPatchWorkflowRow(row.rowKey, { fieldId: event.target.value })
                      }}
                    >
                      <option value="">{builderMessage(locale, 'bindingsFieldSelect')}</option>
                      {bindableFields.map((field) => (
                        <option key={field.fieldId} value={field.fieldId}>
                          {fieldOptionLabel(field.fieldId)}
                        </option>
                      ))}
                    </select>
                    {renderError('fieldId')}
                  </div>
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={workflowControlId(row.rowKey, 'stage')}
                    >
                      {builderMessage(locale, 'bindingsWorkflowStage')}
                    </label>
                    <input
                      id={workflowControlId(row.rowKey, 'stage')}
                      className="dg20-builder-search-input"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={row.stage}
                      disabled={readOnly}
                      aria-invalid={invalid('stage') || undefined}
                      aria-describedby={describedBy('stage')}
                      onChange={(event) => {
                        onPatchWorkflowRow(row.rowKey, { stage: event.target.value })
                      }}
                    />
                    {renderError('stage')}
                  </div>
                </div>
                {invalid('row') ? renderError('row') : null}
                <div className="dg20-builder-bindings__actions">
                  <button
                    type="button"
                    className="dg20-builder-field-action-btn"
                    disabled={readOnly}
                    onClick={() => {
                      onRemoveWorkflowRow(row.rowKey)
                    }}
                  >
                    {builderMessage(locale, 'bindingsWorkflowRemoveRow')}
                  </button>
                </div>
              </article>
            )
          })
        )}

        <div className="dg20-builder-bindings__actions">
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            disabled={readOnly}
            onClick={() => {
              onAddWorkflowRow()
            }}
          >
            {builderMessage(locale, 'bindingsWorkflowAdd')}
          </button>
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            onClick={onApplyWorkflow}
            disabled={readOnly || !workflowDirty}
          >
            {builderMessage(locale, 'bindingsApply')}
          </button>
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            onClick={onCancelWorkflow}
            disabled={
              readOnly
                ? uiState.workflowBindingDraft === null
                : !workflowDirty && !workflowShowValidation && !workflowShowStale
            }
          >
            {builderMessage(locale, 'bindingsCancel')}
          </button>
          <span className="dg20-builder-bindings__chips" aria-live="polite">
            {workflowDirty ? (
              <span className="dg20-builder-chip dg20-builder-chip--dirty">
                {builderMessage(locale, 'bindingsDirty')}
              </span>
            ) : (
              <span className="dg20-builder-chip">{builderMessage(locale, 'bindingsClean')}</span>
            )}
          </span>
        </div>
      </section>
    </div>
  )
}

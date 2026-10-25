import { useId, useMemo, useState } from 'react'
import { getPaletteWidget } from '@citizen/form-widgets'

import {
  FAMILY_MEMBER_WIDGET_TYPES,
  type FamilyMemberWidgetType,
  type FamilyRepeaterDraftContent,
  type FamilyRepeaterDraftEntry,
  validateFamilyRepeaterDraftContent,
} from '../authoring/index.js'
import type { ConfigurationIssue } from '../authoring/property-config-types.js'
import type { BuilderLocale, BuilderMessageKey } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'

const ISSUE_MESSAGE: Record<ConfigurationIssue['code'], BuilderMessageKey> = {
  label_en_required: 'editorErrorLabelEnRequired',
  label_gu_required: 'editorErrorLabelGuRequired',
  label_en_padded: 'editorErrorLabelEnPadded',
  label_gu_padded: 'editorErrorLabelGuPadded',
  help_pair_incomplete: 'editorErrorHelpPairIncomplete',
  help_en_padded: 'editorErrorHelpEnPadded',
  help_gu_padded: 'editorErrorHelpGuPadded',
  help_required: 'editorErrorHelpRequired',
  max_length_invalid: 'editorErrorMaxLengthInvalid',
  pattern_invalid: 'editorErrorPatternInvalid',
  minimum_invalid: 'editorErrorMinimumInvalid',
  maximum_invalid: 'editorErrorMaximumInvalid',
  step_invalid: 'editorErrorStepInvalid',
  range_invalid: 'editorErrorRangeInvalid',
  currency_minimum_negative: 'editorErrorCurrencyMinimumNegative',
  min_age_invalid: 'editorErrorMinAgeInvalid',
  max_age_invalid: 'editorErrorMaxAgeInvalid',
  age_range_invalid: 'editorErrorAgeRangeInvalid',
  master_list_id_invalid: 'editorErrorMasterListIdInvalid',
  min_items_invalid: 'editorErrorMinItemsInvalid',
  max_items_invalid: 'editorErrorMaxItemsInvalid',
  items_range_invalid: 'editorErrorItemsRangeInvalid',
  required_min_items_invalid: 'editorErrorRequiredMinItemsInvalid',
  parent_master_list_id_invalid: 'editorErrorParentMasterListIdInvalid',
  child_master_list_id_invalid: 'editorErrorChildMasterListIdInvalid',
  default_state_code_invalid: 'editorErrorDefaultStateCodeInvalid',
  allowed_mime_types_invalid: 'editorErrorAllowedMimeTypesInvalid',
  max_file_size_bytes_invalid: 'editorErrorMaxFileSizeBytesInvalid',
  digilocker_document_type_code_invalid: 'editorErrorDigiLockerDocumentTypeCodeInvalid',
  fee_rule_id_invalid: 'editorErrorFeeRuleIdInvalid',
  declaration_id_invalid: 'editorErrorDeclarationIdInvalid',
}

export interface FamilyRepeaterEditorProps {
  readonly locale: BuilderLocale
  readonly fieldId: string
  readonly entry: FamilyRepeaterDraftEntry
  readonly dirty: boolean
  readonly onPatch: (
    patch: Readonly<
      Partial<
        Pick<
          FamilyRepeaterDraftContent,
          'labelEn' | 'labelGu' | 'helpEn' | 'helpGu' | 'minItems' | 'maxItems'
        >
      > & {
        readonly memberPropertyName?: string
        readonly memberPatch?: Readonly<Record<string, string | boolean | number>>
      }
    >,
  ) => void
  readonly onApply: () => void
  readonly onCancel: () => void
  readonly onAddMember: (input: {
    readonly widgetType: FamilyMemberWidgetType
    readonly labelEn: string
    readonly labelGu: string
    readonly required: boolean
  }) => void
  readonly onRemoveMember: (propertyName: string) => void
  readonly onMoveMember: (propertyName: string, direction: 'earlier' | 'later') => void
}

function controlId(fieldId: string, control: string): string {
  return `dg20-builder-editor-${fieldId}-${control}`
}

function errorId(fieldId: string, control: string): string {
  return `${controlId(fieldId, control)}-error`
}

function widgetLabel(locale: BuilderLocale, widgetType: string): string {
  const palette = getPaletteWidget(widgetType)
  if (!palette) {
    return widgetType
  }
  return locale === 'gu' ? palette.labelGu : palette.labelEn
}

export function FamilyRepeaterEditor({
  locale,
  fieldId,
  entry,
  dirty,
  onPatch,
  onApply,
  onCancel,
  onAddMember,
  onRemoveMember,
  onMoveMember,
}: FamilyRepeaterEditorProps) {
  const draft = entry.draft
  const showValidation = entry.showValidation
  const showStaleGuidance = entry.showStaleGuidance
  const structureReadOnly = entry.structureReadOnly

  const validation = validateFamilyRepeaterDraftContent(draft)
  const issues = validation.ok ? [] : validation.issues
  const issueByControl = new Map(issues.map((issue) => [issue.control, issue]))

  const [addWidgetType, setAddWidgetType] = useState<FamilyMemberWidgetType>('text-short')
  const [addLabelEn, setAddLabelEn] = useState('')
  const [addLabelGu, setAddLabelGu] = useState('')
  const [addRequired, setAddRequired] = useState(false)
  const addFormId = useId()

  const describedBy = (control: string): string | undefined => {
    if (!showValidation || !issueByControl.has(control)) return undefined
    return errorId(fieldId, control)
  }

  const invalid = (control: string): boolean => showValidation && issueByControl.has(control)

  const renderError = (control: string) => {
    const issue = issueByControl.get(control)
    if (!showValidation || !issue) return null
    return (
      <p id={errorId(fieldId, control)} className="dg20-builder-editor__error" role="presentation">
        {builderMessage(locale, ISSUE_MESSAGE[issue.code])}
      </p>
    )
  }

  const addSupportsRequired = useMemo(() => {
    return getPaletteWidget(addWidgetType)?.supportsRequired === true
  }, [addWidgetType])

  const memberCount = draft.members.length

  return (
    <div className="dg20-builder-editor" data-testid="family-repeater-editor">
      <div className="dg20-builder-editor__status" aria-live="polite">
        {dirty ? (
          <span className="dg20-builder-chip dg20-builder-chip--dirty">
            {builderMessage(locale, 'editorUnsavedChanges')}
          </span>
        ) : (
          <span className="dg20-builder-chip">{builderMessage(locale, 'editorClean')}</span>
        )}
      </div>

      {showStaleGuidance && (
        <div
          id={`dg20-builder-property-summary-${fieldId}`}
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
          id={`dg20-builder-property-summary-${fieldId}`}
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

      <fieldset className="dg20-builder-editor__fieldset">
        <legend className="dg20-builder-editor__legend">
          {builderMessage(locale, 'editorCommonHeading')}
        </legend>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'labelEn')}>
            {builderMessage(locale, 'editorLabelEn')}
          </label>
          <input
            id={controlId(fieldId, 'labelEn')}
            className="dg20-builder-search-input"
            type="text"
            value={draft.labelEn}
            aria-invalid={invalid('labelEn') || undefined}
            aria-describedby={describedBy('labelEn')}
            onChange={(event) => onPatch({ labelEn: event.target.value })}
          />
          {renderError('labelEn')}
        </div>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'labelGu')}>
            {builderMessage(locale, 'editorLabelGu')}
          </label>
          <input
            id={controlId(fieldId, 'labelGu')}
            className="dg20-builder-search-input"
            type="text"
            value={draft.labelGu}
            aria-invalid={invalid('labelGu') || undefined}
            aria-describedby={describedBy('labelGu')}
            onChange={(event) => onPatch({ labelGu: event.target.value })}
          />
          {renderError('labelGu')}
        </div>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'helpEn')}>
            {builderMessage(locale, 'editorHelpEn')}
          </label>
          <textarea
            id={controlId(fieldId, 'helpEn')}
            className="dg20-builder-editor__textarea"
            rows={2}
            value={draft.helpEn}
            aria-invalid={invalid('helpEn') || undefined}
            aria-describedby={describedBy('helpEn')}
            onChange={(event) => onPatch({ helpEn: event.target.value })}
          />
          {renderError('helpEn')}
        </div>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'helpGu')}>
            {builderMessage(locale, 'editorHelpGu')}
          </label>
          <textarea
            id={controlId(fieldId, 'helpGu')}
            className="dg20-builder-editor__textarea"
            rows={2}
            value={draft.helpGu}
            aria-invalid={invalid('helpGu') || undefined}
            aria-describedby={describedBy('helpGu')}
            onChange={(event) => onPatch({ helpGu: event.target.value })}
          />
          {renderError('helpGu')}
        </div>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'minItems')}>
            {builderMessage(locale, 'editorMinItems')}
          </label>
          <input
            id={controlId(fieldId, 'minItems')}
            className="dg20-builder-search-input"
            type="text"
            inputMode="numeric"
            value={draft.minItems}
            aria-invalid={invalid('minItems') || undefined}
            aria-describedby={describedBy('minItems')}
            onChange={(event) => onPatch({ minItems: event.target.value })}
          />
          {renderError('minItems')}
        </div>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'maxItems')}>
            {builderMessage(locale, 'editorMaxItems')}
          </label>
          <input
            id={controlId(fieldId, 'maxItems')}
            className="dg20-builder-search-input"
            type="text"
            inputMode="numeric"
            value={draft.maxItems}
            aria-invalid={invalid('maxItems') || undefined}
            aria-describedby={describedBy('maxItems')}
            onChange={(event) => onPatch({ maxItems: event.target.value })}
          />
          {renderError('maxItems')}
        </div>
      </fieldset>

      <fieldset className="dg20-builder-editor__fieldset">
        <legend className="dg20-builder-editor__legend">
          {builderMessage(locale, 'familyRepeaterMembersHeading')}
        </legend>

        {structureReadOnly && (
          <p className="dg20-builder-editor__hint" role="note">
            {builderMessage(locale, 'familyRepeaterMembersReadOnly')}
          </p>
        )}

        <ol className="dg20-builder-family-members">
          {draft.members.map((member, index) => {
            const config = member.configuration
            const supportsRequired = getPaletteWidget(config.widgetType)?.supportsRequired === true
            const memberPrefix = `member:${member.propertyName}`
            return (
              <li key={member.propertyName} className="dg20-builder-family-members__item">
                <p className="dg20-builder-family-members__type">
                  {widgetLabel(locale, config.widgetType)}
                  <code> ({config.widgetType})</code>
                </p>

                <div className="dg20-builder-editor__field">
                  <label
                    className="dg20-builder-label"
                    htmlFor={controlId(fieldId, `${memberPrefix}:labelEn`)}
                  >
                    {builderMessage(locale, 'editorLabelEn')}
                  </label>
                  <input
                    id={controlId(fieldId, `${memberPrefix}:labelEn`)}
                    className="dg20-builder-search-input"
                    type="text"
                    value={config.labelEn}
                    disabled={structureReadOnly}
                    aria-invalid={invalid(`${memberPrefix}:labelEn`) || undefined}
                    aria-describedby={describedBy(`${memberPrefix}:labelEn`)}
                    onChange={(event) =>
                      onPatch({
                        memberPropertyName: member.propertyName,
                        memberPatch: { labelEn: event.target.value },
                      })
                    }
                  />
                  {renderError(`${memberPrefix}:labelEn`)}
                </div>

                <div className="dg20-builder-editor__field">
                  <label
                    className="dg20-builder-label"
                    htmlFor={controlId(fieldId, `${memberPrefix}:labelGu`)}
                  >
                    {builderMessage(locale, 'editorLabelGu')}
                  </label>
                  <input
                    id={controlId(fieldId, `${memberPrefix}:labelGu`)}
                    className="dg20-builder-search-input"
                    type="text"
                    value={config.labelGu}
                    disabled={structureReadOnly}
                    aria-invalid={invalid(`${memberPrefix}:labelGu`) || undefined}
                    aria-describedby={describedBy(`${memberPrefix}:labelGu`)}
                    onChange={(event) =>
                      onPatch({
                        memberPropertyName: member.propertyName,
                        memberPatch: { labelGu: event.target.value },
                      })
                    }
                  />
                  {renderError(`${memberPrefix}:labelGu`)}
                </div>

                {'helpEn' in config && (
                  <>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:helpEn`)}
                      >
                        {builderMessage(locale, 'editorHelpEn')}
                      </label>
                      <textarea
                        id={controlId(fieldId, `${memberPrefix}:helpEn`)}
                        className="dg20-builder-editor__textarea"
                        rows={2}
                        value={config.helpEn}
                        disabled={structureReadOnly}
                        aria-invalid={invalid(`${memberPrefix}:helpEn`) || undefined}
                        aria-describedby={describedBy(`${memberPrefix}:helpEn`)}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { helpEn: event.target.value },
                          })
                        }
                      />
                      {renderError(`${memberPrefix}:helpEn`)}
                    </div>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:helpGu`)}
                      >
                        {builderMessage(locale, 'editorHelpGu')}
                      </label>
                      <textarea
                        id={controlId(fieldId, `${memberPrefix}:helpGu`)}
                        className="dg20-builder-editor__textarea"
                        rows={2}
                        value={config.helpGu}
                        disabled={structureReadOnly}
                        aria-invalid={invalid(`${memberPrefix}:helpGu`) || undefined}
                        aria-describedby={describedBy(`${memberPrefix}:helpGu`)}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { helpGu: event.target.value },
                          })
                        }
                      />
                      {renderError(`${memberPrefix}:helpGu`)}
                    </div>
                  </>
                )}

                {supportsRequired && 'required' in config && (
                  <div className="dg20-builder-editor__field">
                    <label className="dg20-builder-checkbox-label">
                      <input
                        type="checkbox"
                        checked={config.required === true}
                        disabled={structureReadOnly}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { required: event.target.checked },
                          })
                        }
                      />
                      {builderMessage(locale, 'familyRepeaterMemberRequired')}
                    </label>
                  </div>
                )}

                {config.widgetType === 'text-short' && (
                  <>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:maxLength`)}
                      >
                        {builderMessage(locale, 'editorMaxLength')}
                      </label>
                      <input
                        id={controlId(fieldId, `${memberPrefix}:maxLength`)}
                        className="dg20-builder-search-input"
                        type="text"
                        inputMode="numeric"
                        value={config.maxLength}
                        disabled={structureReadOnly}
                        aria-invalid={invalid(`${memberPrefix}:maxLength`) || undefined}
                        aria-describedby={describedBy(`${memberPrefix}:maxLength`)}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { maxLength: event.target.value },
                          })
                        }
                      />
                      {renderError(`${memberPrefix}:maxLength`)}
                    </div>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:pattern`)}
                      >
                        {builderMessage(locale, 'editorPattern')}
                      </label>
                      <input
                        id={controlId(fieldId, `${memberPrefix}:pattern`)}
                        className="dg20-builder-search-input"
                        type="text"
                        value={config.pattern}
                        disabled={structureReadOnly}
                        aria-invalid={invalid(`${memberPrefix}:pattern`) || undefined}
                        aria-describedby={describedBy(`${memberPrefix}:pattern`)}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { pattern: event.target.value },
                          })
                        }
                      />
                      {renderError(`${memberPrefix}:pattern`)}
                    </div>
                  </>
                )}

                {config.widgetType === 'text-long' && (
                  <div className="dg20-builder-editor__field">
                    <label
                      className="dg20-builder-label"
                      htmlFor={controlId(fieldId, `${memberPrefix}:maxLength`)}
                    >
                      {builderMessage(locale, 'editorMaxLength')}
                    </label>
                    <input
                      id={controlId(fieldId, `${memberPrefix}:maxLength`)}
                      className="dg20-builder-search-input"
                      type="text"
                      inputMode="numeric"
                      value={config.maxLength}
                      disabled={structureReadOnly}
                      aria-invalid={invalid(`${memberPrefix}:maxLength`) || undefined}
                      aria-describedby={describedBy(`${memberPrefix}:maxLength`)}
                      onChange={(event) =>
                        onPatch({
                          memberPropertyName: member.propertyName,
                          memberPatch: { maxLength: event.target.value },
                        })
                      }
                    />
                    {renderError(`${memberPrefix}:maxLength`)}
                  </div>
                )}

                {config.widgetType === 'number' && (
                  <>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:minimum`)}
                      >
                        {builderMessage(locale, 'editorMinimum')}
                      </label>
                      <input
                        id={controlId(fieldId, `${memberPrefix}:minimum`)}
                        className="dg20-builder-search-input"
                        type="text"
                        value={config.minimum}
                        disabled={structureReadOnly}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { minimum: event.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:maximum`)}
                      >
                        {builderMessage(locale, 'editorMaximum')}
                      </label>
                      <input
                        id={controlId(fieldId, `${memberPrefix}:maximum`)}
                        className="dg20-builder-search-input"
                        type="text"
                        value={config.maximum}
                        disabled={structureReadOnly}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { maximum: event.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:step`)}
                      >
                        {builderMessage(locale, 'editorStep')}
                      </label>
                      <input
                        id={controlId(fieldId, `${memberPrefix}:step`)}
                        className="dg20-builder-search-input"
                        type="text"
                        value={config.step}
                        disabled={structureReadOnly}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { step: event.target.value },
                          })
                        }
                      />
                    </div>
                  </>
                )}

                {config.widgetType === 'currency-inr' && (
                  <>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:minimum`)}
                      >
                        {builderMessage(locale, 'editorMinimum')}
                      </label>
                      <input
                        id={controlId(fieldId, `${memberPrefix}:minimum`)}
                        className="dg20-builder-search-input"
                        type="text"
                        value={config.minimum}
                        disabled={structureReadOnly}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { minimum: event.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:maximum`)}
                      >
                        {builderMessage(locale, 'editorMaximum')}
                      </label>
                      <input
                        id={controlId(fieldId, `${memberPrefix}:maximum`)}
                        className="dg20-builder-search-input"
                        type="text"
                        value={config.maximum}
                        disabled={structureReadOnly}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { maximum: event.target.value },
                          })
                        }
                      />
                    </div>
                  </>
                )}

                {config.widgetType === 'email' && (
                  <div className="dg20-builder-editor__field">
                    <label className="dg20-builder-checkbox-label">
                      <input
                        type="checkbox"
                        checked={config.verifyEmail}
                        disabled={structureReadOnly}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { verifyEmail: event.target.checked },
                          })
                        }
                      />
                      {builderMessage(locale, 'editorVerifyEmail')}
                    </label>
                  </div>
                )}

                {config.widgetType === 'dob' && (
                  <>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:minAge`)}
                      >
                        {builderMessage(locale, 'editorMinAge')}
                      </label>
                      <input
                        id={controlId(fieldId, `${memberPrefix}:minAge`)}
                        className="dg20-builder-search-input"
                        type="text"
                        value={config.minAge}
                        disabled={structureReadOnly}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { minAge: event.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="dg20-builder-editor__field">
                      <label
                        className="dg20-builder-label"
                        htmlFor={controlId(fieldId, `${memberPrefix}:maxAge`)}
                      >
                        {builderMessage(locale, 'editorMaxAge')}
                      </label>
                      <input
                        id={controlId(fieldId, `${memberPrefix}:maxAge`)}
                        className="dg20-builder-search-input"
                        type="text"
                        value={config.maxAge}
                        disabled={structureReadOnly}
                        onChange={(event) =>
                          onPatch({
                            memberPropertyName: member.propertyName,
                            memberPatch: { maxAge: event.target.value },
                          })
                        }
                      />
                    </div>
                  </>
                )}

                {!structureReadOnly && (
                  <div className="dg20-builder-inspector__actions">
                    <button
                      type="button"
                      className="dg20-builder-field-action-btn"
                      style={{ minHeight: 44 }}
                      disabled={index === 0}
                      onClick={() => onMoveMember(member.propertyName, 'earlier')}
                    >
                      {builderMessage(locale, 'familyRepeaterMoveEarlier')}
                    </button>
                    <button
                      type="button"
                      className="dg20-builder-field-action-btn"
                      style={{ minHeight: 44 }}
                      disabled={index >= memberCount - 1}
                      onClick={() => onMoveMember(member.propertyName, 'later')}
                    >
                      {builderMessage(locale, 'familyRepeaterMoveLater')}
                    </button>
                    <button
                      type="button"
                      className="dg20-builder-field-action-btn dg20-builder-field-action-btn--danger"
                      style={{ minHeight: 44 }}
                      disabled={memberCount <= 1}
                      onClick={() => onRemoveMember(member.propertyName)}
                    >
                      {builderMessage(locale, 'familyRepeaterRemoveMember')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>

        {!structureReadOnly && (
          <div className="dg20-builder-family-members__add" id={addFormId}>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={`${addFormId}-widget`}>
                {builderMessage(locale, 'familyRepeaterMemberWidgetType')}
              </label>
              <select
                id={`${addFormId}-widget`}
                className="dg20-builder-search-input"
                value={addWidgetType}
                onChange={(event) => setAddWidgetType(event.target.value as FamilyMemberWidgetType)}
              >
                {FAMILY_MEMBER_WIDGET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {widgetLabel(locale, type)}
                  </option>
                ))}
              </select>
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={`${addFormId}-label-en`}>
                {builderMessage(locale, 'editorLabelEn')}
              </label>
              <input
                id={`${addFormId}-label-en`}
                className="dg20-builder-search-input"
                type="text"
                value={addLabelEn}
                onChange={(event) => setAddLabelEn(event.target.value)}
              />
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={`${addFormId}-label-gu`}>
                {builderMessage(locale, 'editorLabelGu')}
              </label>
              <input
                id={`${addFormId}-label-gu`}
                className="dg20-builder-search-input"
                type="text"
                value={addLabelGu}
                onChange={(event) => setAddLabelGu(event.target.value)}
              />
            </div>
            {addSupportsRequired && (
              <div className="dg20-builder-editor__field">
                <label className="dg20-builder-checkbox-label">
                  <input
                    type="checkbox"
                    checked={addRequired}
                    onChange={(event) => setAddRequired(event.target.checked)}
                  />
                  {builderMessage(locale, 'familyRepeaterMemberRequired')}
                </label>
              </div>
            )}
            <button
              type="button"
              className="dg20-builder-field-action-btn"
              style={{ minHeight: 44 }}
              data-testid="family-repeater-add-member"
              onClick={() => {
                onAddMember({
                  widgetType: addWidgetType,
                  labelEn: addLabelEn,
                  labelGu: addLabelGu,
                  required: addSupportsRequired ? addRequired : false,
                })
                setAddLabelEn('')
                setAddLabelGu('')
                setAddRequired(false)
              }}
            >
              {builderMessage(locale, 'familyRepeaterAddMember')}
            </button>
          </div>
        )}
      </fieldset>

      <div className="dg20-builder-editor__actions">
        <button
          type="button"
          className="dg20-builder-field-action-btn"
          style={{ minHeight: 44 }}
          data-testid="family-repeater-apply"
          onClick={onApply}
          disabled={!dirty && !showValidation && !showStaleGuidance}
        >
          {builderMessage(locale, 'editorApply')}
        </button>
        <button
          type="button"
          className="dg20-builder-field-action-btn"
          style={{ minHeight: 44 }}
          data-testid="family-repeater-cancel"
          onClick={onCancel}
          disabled={!dirty && !showValidation && !showStaleGuidance}
        >
          {builderMessage(locale, 'editorCancel')}
        </button>
      </div>
    </div>
  )
}

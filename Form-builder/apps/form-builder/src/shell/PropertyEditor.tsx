import type { BuilderLocale, BuilderMessageKey } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'
import type {
  ConfigurationIssue,
  FieldConfigurationDraft,
} from '../authoring/property-config-types.js'
import { validateFieldConfigurationDraft } from '../authoring/validate-field-configuration.js'
import { isEditableWidgetType } from '../authoring/property-config-types.js'

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

export interface PropertyEditorProps {
  readonly locale: BuilderLocale
  readonly fieldId: string
  readonly draft: FieldConfigurationDraft
  readonly showValidation: boolean
  readonly showStaleGuidance: boolean
  readonly dirty: boolean
  readonly previewWarning: boolean
  readonly onPatch: (patch: Readonly<Record<string, string | boolean | number>>) => void
  readonly onApply: () => void
  readonly onCancel: () => void
}

function controlId(fieldId: string, control: string): string {
  return `dg20-builder-editor-${fieldId}-${control}`
}

function errorId(fieldId: string, control: string): string {
  return `${controlId(fieldId, control)}-error`
}

export function PropertyEditor({
  locale,
  fieldId,
  draft,
  showValidation,
  showStaleGuidance,
  dirty,
  previewWarning,
  onPatch,
  onApply,
  onCancel,
}: PropertyEditorProps) {
  const validation = validateFieldConfigurationDraft(draft)
  const issues = validation.ok ? [] : validation.issues
  const issueByControl = new Map(issues.map((issue) => [issue.control, issue]))

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

  const supportsRequired =
    draft.widgetType !== 'section-header' &&
    draft.widgetType !== 'info-panel' &&
    draft.widgetType !== 'fee-field' &&
    draft.widgetType !== 'eligibility-declaration' &&
    draft.widgetType !== 'caf-prefill' &&
    draft.widgetType !== 'family-repeater'
  const showWidgetConstraints =
    draft.widgetType === 'text-short' ||
    draft.widgetType === 'text-long' ||
    draft.widgetType === 'number' ||
    draft.widgetType === 'currency-inr' ||
    draft.widgetType === 'email' ||
    draft.widgetType === 'dob' ||
    draft.widgetType === 'dropdown-master' ||
    draft.widgetType === 'radio' ||
    draft.widgetType === 'multiselect' ||
    draft.widgetType === 'cascading-dropdown' ||
    draft.widgetType === 'address-block' ||
    draft.widgetType === 'doc-upload' ||
    draft.widgetType === 'digilocker-fetch' ||
    draft.widgetType === 'fee-field' ||
    draft.widgetType === 'eligibility-declaration'

  return (
    <div className="dg20-builder-editor">
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

      {previewWarning && (
        <p className="dg20-builder-editor__warning" role="note">
          {builderMessage(locale, 'editorPreviewValueWarning')}
        </p>
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
            {builderMessage(
              locale,
              draft.widgetType === 'info-panel' || draft.widgetType === 'eligibility-declaration'
                ? 'editorHelpEnRequired'
                : 'editorHelpEn',
            )}
          </label>
          <textarea
            id={controlId(fieldId, 'helpEn')}
            className="dg20-builder-editor__textarea"
            rows={3}
            value={draft.helpEn}
            aria-invalid={invalid('helpEn') || undefined}
            aria-describedby={describedBy('helpEn')}
            onChange={(event) => onPatch({ helpEn: event.target.value })}
          />
          {renderError('helpEn')}
        </div>

        <div className="dg20-builder-editor__field">
          <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'helpGu')}>
            {builderMessage(
              locale,
              draft.widgetType === 'info-panel' || draft.widgetType === 'eligibility-declaration'
                ? 'editorHelpGuRequired'
                : 'editorHelpGu',
            )}
          </label>
          <textarea
            id={controlId(fieldId, 'helpGu')}
            className="dg20-builder-editor__textarea"
            rows={3}
            value={draft.helpGu}
            aria-invalid={invalid('helpGu') || undefined}
            aria-describedby={describedBy('helpGu')}
            onChange={(event) => onPatch({ helpGu: event.target.value })}
          />
          {renderError('helpGu')}
        </div>

        {supportsRequired && 'required' in draft && (
          <div className="dg20-builder-editor__field dg20-builder-editor__field--checkbox">
            <input
              id={controlId(fieldId, 'required')}
              type="checkbox"
              checked={Boolean(draft.required)}
              onChange={(event) => onPatch({ required: event.target.checked })}
            />
            <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'required')}>
              {builderMessage(locale, 'editorRequired')}
            </label>
          </div>
        )}
      </fieldset>

      {showWidgetConstraints && (
        <fieldset className="dg20-builder-editor__fieldset">
          <legend className="dg20-builder-editor__legend">
            {builderMessage(locale, 'editorConstraintsHeading')}
          </legend>

          {(draft.widgetType === 'text-short' || draft.widgetType === 'text-long') && (
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'maxLength')}>
                {builderMessage(locale, 'editorMaxLength')}
              </label>
              <input
                id={controlId(fieldId, 'maxLength')}
                className="dg20-builder-search-input"
                type="text"
                inputMode="numeric"
                value={draft.maxLength}
                aria-invalid={invalid('maxLength') || undefined}
                aria-describedby={describedBy('maxLength')}
                onChange={(event) => onPatch({ maxLength: event.target.value })}
              />
              {renderError('maxLength')}
            </div>
          )}

          {draft.widgetType === 'text-short' && (
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'pattern')}>
                {builderMessage(locale, 'editorPattern')}
              </label>
              <input
                id={controlId(fieldId, 'pattern')}
                className="dg20-builder-search-input"
                type="text"
                value={draft.pattern}
                aria-invalid={invalid('pattern') || undefined}
                aria-describedby={describedBy('pattern')}
                onChange={(event) => onPatch({ pattern: event.target.value })}
              />
              {renderError('pattern')}
            </div>
          )}

          {draft.widgetType === 'number' && (
            <>
              <div className="dg20-builder-editor__field">
                <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'minimum')}>
                  {builderMessage(locale, 'editorMinimum')}
                </label>
                <input
                  id={controlId(fieldId, 'minimum')}
                  className="dg20-builder-search-input"
                  type="text"
                  inputMode="decimal"
                  value={draft.minimum}
                  aria-invalid={invalid('minimum') || undefined}
                  aria-describedby={describedBy('minimum')}
                  onChange={(event) => onPatch({ minimum: event.target.value })}
                />
                {renderError('minimum')}
              </div>
              <div className="dg20-builder-editor__field">
                <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'maximum')}>
                  {builderMessage(locale, 'editorMaximum')}
                </label>
                <input
                  id={controlId(fieldId, 'maximum')}
                  className="dg20-builder-search-input"
                  type="text"
                  inputMode="decimal"
                  value={draft.maximum}
                  aria-invalid={invalid('maximum') || undefined}
                  aria-describedby={describedBy('maximum')}
                  onChange={(event) => onPatch({ maximum: event.target.value })}
                />
                {renderError('maximum')}
              </div>
              <div className="dg20-builder-editor__field">
                <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'step')}>
                  {builderMessage(locale, 'editorStep')}
                </label>
                <input
                  id={controlId(fieldId, 'step')}
                  className="dg20-builder-search-input"
                  type="text"
                  inputMode="decimal"
                  value={draft.step}
                  aria-invalid={invalid('step') || undefined}
                  aria-describedby={describedBy('step')}
                  onChange={(event) => onPatch({ step: event.target.value })}
                />
                {renderError('step')}
              </div>
            </>
          )}

          {draft.widgetType === 'currency-inr' && (
            <>
              <div className="dg20-builder-editor__field">
                <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'minimum')}>
                  {builderMessage(locale, 'editorMinimum')}
                </label>
                <input
                  id={controlId(fieldId, 'minimum')}
                  className="dg20-builder-search-input"
                  type="text"
                  inputMode="decimal"
                  value={draft.minimum}
                  aria-invalid={invalid('minimum') || undefined}
                  aria-describedby={describedBy('minimum')}
                  onChange={(event) => onPatch({ minimum: event.target.value })}
                />
                {renderError('minimum')}
              </div>
              <div className="dg20-builder-editor__field">
                <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'maximum')}>
                  {builderMessage(locale, 'editorMaximum')}
                </label>
                <input
                  id={controlId(fieldId, 'maximum')}
                  className="dg20-builder-search-input"
                  type="text"
                  inputMode="decimal"
                  value={draft.maximum}
                  aria-invalid={invalid('maximum') || undefined}
                  aria-describedby={describedBy('maximum')}
                  onChange={(event) => onPatch({ maximum: event.target.value })}
                />
                {renderError('maximum')}
              </div>
              <p className="dg20-builder-editor__hint">
                {builderMessage(locale, 'editorCurrencyPrecisionHint')}
              </p>
            </>
          )}

          {draft.widgetType === 'email' && (
            <div className="dg20-builder-editor__checkbox">
              <input
                id={controlId(fieldId, 'verifyEmail')}
                type="checkbox"
                checked={draft.verifyEmail}
                onChange={(event) => onPatch({ verifyEmail: event.target.checked })}
              />
              <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'verifyEmail')}>
                {builderMessage(locale, 'editorVerifyEmail')}
              </label>
            </div>
          )}

          {draft.widgetType === 'dob' && (
            <>
              <div className="dg20-builder-editor__field">
                <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'minAge')}>
                  {builderMessage(locale, 'editorMinAge')}
                </label>
                <input
                  id={controlId(fieldId, 'minAge')}
                  className="dg20-builder-search-input"
                  type="text"
                  inputMode="numeric"
                  value={draft.minAge}
                  aria-invalid={invalid('minAge') || undefined}
                  aria-describedby={describedBy('minAge')}
                  onChange={(event) => onPatch({ minAge: event.target.value })}
                />
                {renderError('minAge')}
              </div>
              <div className="dg20-builder-editor__field">
                <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'maxAge')}>
                  {builderMessage(locale, 'editorMaxAge')}
                </label>
                <input
                  id={controlId(fieldId, 'maxAge')}
                  className="dg20-builder-search-input"
                  type="text"
                  inputMode="numeric"
                  value={draft.maxAge}
                  aria-invalid={invalid('maxAge') || undefined}
                  aria-describedby={describedBy('maxAge')}
                  onChange={(event) => onPatch({ maxAge: event.target.value })}
                />
                {renderError('maxAge')}
              </div>
            </>
          )}

          {(draft.widgetType === 'dropdown-master' ||
            draft.widgetType === 'radio' ||
            draft.widgetType === 'multiselect') && (
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'masterListId')}>
                {builderMessage(locale, 'editorMasterListId')}
              </label>
              <input
                id={controlId(fieldId, 'masterListId')}
                className="dg20-builder-search-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={draft.masterListId}
                aria-invalid={invalid('masterListId') || undefined}
                aria-describedby={describedBy('masterListId')}
                onChange={(event) => onPatch({ masterListId: event.target.value })}
              />
              {renderError('masterListId')}
            </div>
          )}

          {draft.widgetType === 'multiselect' && (
            <>
              <div className="dg20-builder-editor__field">
                <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'minItems')}>
                  {builderMessage(locale, 'editorMinItems')}
                </label>
                <input
                  id={controlId(fieldId, 'minItems')}
                  className="dg20-builder-search-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
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
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.maxItems}
                  aria-invalid={invalid('maxItems') || undefined}
                  aria-describedby={describedBy('maxItems')}
                  onChange={(event) => onPatch({ maxItems: event.target.value })}
                />
                {renderError('maxItems')}
              </div>
            </>
          )}

          {draft.widgetType === 'cascading-dropdown' && (
            <>
              <div className="dg20-builder-editor__field">
                <label
                  className="dg20-builder-label"
                  htmlFor={controlId(fieldId, 'parentMasterListId')}
                >
                  {builderMessage(locale, 'editorParentMasterListId')}
                </label>
                <input
                  id={controlId(fieldId, 'parentMasterListId')}
                  className="dg20-builder-search-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.parentMasterListId}
                  aria-invalid={invalid('parentMasterListId') || undefined}
                  aria-describedby={describedBy('parentMasterListId')}
                  onChange={(event) => onPatch({ parentMasterListId: event.target.value })}
                />
                {renderError('parentMasterListId')}
              </div>
              <div className="dg20-builder-editor__field">
                <label
                  className="dg20-builder-label"
                  htmlFor={controlId(fieldId, 'childMasterListId')}
                >
                  {builderMessage(locale, 'editorChildMasterListId')}
                </label>
                <input
                  id={controlId(fieldId, 'childMasterListId')}
                  className="dg20-builder-search-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.childMasterListId}
                  aria-invalid={invalid('childMasterListId') || undefined}
                  aria-describedby={describedBy('childMasterListId')}
                  onChange={(event) => onPatch({ childMasterListId: event.target.value })}
                />
                {renderError('childMasterListId')}
              </div>
            </>
          )}

          {draft.widgetType === 'address-block' && (
            <div className="dg20-builder-editor__field">
              <label
                className="dg20-builder-label"
                htmlFor={controlId(fieldId, 'defaultStateCode')}
              >
                {builderMessage(locale, 'editorDefaultStateCode')}
              </label>
              <input
                id={controlId(fieldId, 'defaultStateCode')}
                className="dg20-builder-search-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={draft.defaultStateCode}
                aria-invalid={invalid('defaultStateCode') || undefined}
                aria-describedby={describedBy('defaultStateCode')}
                onChange={(event) => onPatch({ defaultStateCode: event.target.value })}
              />
              {renderError('defaultStateCode')}
              <p className="dg20-builder-editor__hint">
                {builderMessage(locale, 'editorDefaultStateCodeHint')}
              </p>
            </div>
          )}

          {draft.widgetType === 'doc-upload' && (
            <>
              <div className="dg20-builder-editor__field">
                <label
                  className="dg20-builder-label"
                  htmlFor={controlId(fieldId, 'allowedMimeTypesText')}
                >
                  {builderMessage(locale, 'editorAllowedMimeTypes')}
                </label>
                <textarea
                  id={controlId(fieldId, 'allowedMimeTypesText')}
                  className="dg20-builder-search-input"
                  rows={4}
                  spellCheck={false}
                  value={draft.allowedMimeTypesText}
                  aria-invalid={invalid('allowedMimeTypesText') || undefined}
                  aria-describedby={describedBy('allowedMimeTypesText')}
                  onChange={(event) => onPatch({ allowedMimeTypesText: event.target.value })}
                />
                {renderError('allowedMimeTypesText')}
                <p className="dg20-builder-editor__hint">
                  {builderMessage(locale, 'editorAllowedMimeTypesHint')}
                </p>
              </div>
              <div className="dg20-builder-editor__field">
                <label
                  className="dg20-builder-label"
                  htmlFor={controlId(fieldId, 'maxFileSizeBytes')}
                >
                  {builderMessage(locale, 'editorMaxFileSizeBytes')}
                </label>
                <input
                  id={controlId(fieldId, 'maxFileSizeBytes')}
                  className="dg20-builder-search-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.maxFileSizeBytes}
                  aria-invalid={invalid('maxFileSizeBytes') || undefined}
                  aria-describedby={describedBy('maxFileSizeBytes')}
                  onChange={(event) => onPatch({ maxFileSizeBytes: event.target.value })}
                />
                {renderError('maxFileSizeBytes')}
                <p className="dg20-builder-editor__hint">
                  {builderMessage(locale, 'editorMaxFileSizeBytesHint')}
                </p>
              </div>
            </>
          )}

          {draft.widgetType === 'digilocker-fetch' && (
            <div className="dg20-builder-editor__field">
              <label
                className="dg20-builder-label"
                htmlFor={controlId(fieldId, 'digiLockerDocumentTypeCode')}
              >
                {builderMessage(locale, 'editorDigiLockerDocumentTypeCode')}
              </label>
              <input
                id={controlId(fieldId, 'digiLockerDocumentTypeCode')}
                className="dg20-builder-search-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={draft.digiLockerDocumentTypeCode}
                aria-invalid={invalid('digiLockerDocumentTypeCode') || undefined}
                aria-describedby={describedBy('digiLockerDocumentTypeCode')}
                onChange={(event) => onPatch({ digiLockerDocumentTypeCode: event.target.value })}
              />
              {renderError('digiLockerDocumentTypeCode')}
              <p className="dg20-builder-editor__hint">
                {builderMessage(locale, 'editorDigiLockerDocumentTypeCodeHint')}
              </p>
            </div>
          )}

          {draft.widgetType === 'fee-field' && (
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'feeRuleId')}>
                {builderMessage(locale, 'editorFeeRuleId')}
              </label>
              <input
                id={controlId(fieldId, 'feeRuleId')}
                className="dg20-builder-search-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={draft.feeRuleId}
                aria-invalid={invalid('feeRuleId') || undefined}
                aria-describedby={describedBy('feeRuleId')}
                onChange={(event) => onPatch({ feeRuleId: event.target.value })}
              />
              {renderError('feeRuleId')}
              <p className="dg20-builder-editor__hint">
                {builderMessage(locale, 'editorFeeFieldPolicyHint')}
              </p>
            </div>
          )}

          {draft.widgetType === 'eligibility-declaration' && (
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={controlId(fieldId, 'declarationId')}>
                {builderMessage(locale, 'editorDeclarationId')}
              </label>
              <input
                id={controlId(fieldId, 'declarationId')}
                className="dg20-builder-search-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={draft.declarationId}
                aria-invalid={invalid('declarationId') || undefined}
                aria-describedby={describedBy('declarationId')}
                onChange={(event) => onPatch({ declarationId: event.target.value })}
              />
              {renderError('declarationId')}
              <p className="dg20-builder-editor__hint">
                {builderMessage(locale, 'editorEligibilityDeclarationPolicyHint')}
              </p>
            </div>
          )}
        </fieldset>
      )}

      {(draft.widgetType === 'percentage' ||
        draft.widgetType === 'gender' ||
        draft.widgetType === 'yesno' ||
        draft.widgetType === 'full-name' ||
        draft.widgetType === 'pincode' ||
        draft.widgetType === 'aadhaar' ||
        draft.widgetType === 'bank-account') && (
        <p className="dg20-builder-editor__hint">
          {builderMessage(locale, 'editorBakedConstraintsHint')}
        </p>
      )}

      {draft.widgetType === 'photo-capture' && (
        <p className="dg20-builder-editor__hint">
          {builderMessage(locale, 'editorPhotoCapturePolicyHint')}
        </p>
      )}

      {draft.widgetType === 'signature-esign' && (
        <p className="dg20-builder-editor__hint">
          {builderMessage(locale, 'editorSignatureEsignPolicyHint')}
        </p>
      )}

      {draft.widgetType === 'caf-prefill' && (
        <p className="dg20-builder-editor__hint">
          {builderMessage(locale, 'editorCafPrefillPolicyHint')}
        </p>
      )}

      {draft.widgetType === 'mobile-otp' && (
        <p className="dg20-builder-editor__hint">
          {builderMessage(locale, 'editorMobileOtpSmsOnlyHint')}
        </p>
      )}

      <div className="dg20-builder-editor__actions">
        <button
          type="button"
          className="dg20-builder-field-action-btn"
          onClick={onApply}
          disabled={!dirty}
        >
          {builderMessage(locale, 'editorApply')}
        </button>
        <button
          type="button"
          className="dg20-builder-field-action-btn"
          onClick={onCancel}
          disabled={!dirty && !showValidation}
        >
          {builderMessage(locale, 'editorCancel')}
        </button>
      </div>
    </div>
  )
}

export function isSupportedEditorWidget(widgetType: string): boolean {
  return isEditableWidgetType(widgetType)
}

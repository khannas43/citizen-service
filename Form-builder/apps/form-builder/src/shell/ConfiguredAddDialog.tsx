import { useEffect, useId, useRef } from 'react'
import { getPaletteWidget } from '@citizen/form-widgets'

import type {
  ConfiguredAddFocusControl,
  PendingConfiguredAdd,
  PendingConfiguredAddFocusRequest,
  PendingConfiguredAddPatch,
} from '../authoring/index.js'
import { FAMILY_MEMBER_WIDGET_TYPES } from '../authoring/index.js'
import type { FamilyMemberWidgetType } from '../authoring/index.js'
import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'

export interface ConfiguredAddDialogProps {
  readonly locale: BuilderLocale
  readonly pending: PendingConfiguredAdd
  readonly focusRequest: PendingConfiguredAddFocusRequest | null
  readonly onPatch: (patch: PendingConfiguredAddPatch) => void
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function listFocusable(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') {
      return false
    }
    if (el === document.activeElement) {
      return true
    }
    return el.tabIndex >= 0 || el.tagName === 'INPUT' || el.tagName === 'BUTTON'
  })
}

/**
 * Accessible pre-add configuration dialog (FB-D9 / FB-D9.1 / FB-D10).
 */
export function ConfiguredAddDialog({
  locale,
  pending,
  focusRequest,
  onPatch,
  onConfirm,
  onCancel,
}: ConfiguredAddDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const masterListIdInputId = useId()
  const minItemsInputId = useId()
  const maxItemsInputId = useId()
  const parentMasterListIdInputId = useId()
  const childMasterListIdInputId = useId()
  const allowedMimeTypesInputId = useId()
  const maxFileSizeBytesInputId = useId()
  const digiLockerCodeInputId = useId()
  const feeRuleIdInputId = useId()
  const declarationIdInputId = useId()
  const declarationTextEnInputId = useId()
  const declarationTextGuInputId = useId()
  const cafAttributeInputId = useId()
  const confidenceMinInputId = useId()
  const initialMemberWidgetTypeId = useId()
  const initialMemberLabelEnId = useId()
  const initialMemberLabelGuId = useId()
  const masterListIdErrorId = useId()
  const minItemsErrorId = useId()
  const maxItemsErrorId = useId()
  const parentErrorId = useId()
  const childErrorId = useId()
  const allowedMimeErrorId = useId()
  const maxFileSizeErrorId = useId()
  const digiLockerErrorId = useId()
  const feeRuleIdErrorId = useId()
  const declarationIdErrorId = useId()
  const declarationTextEnErrorId = useId()
  const declarationTextGuErrorId = useId()
  const cafAttributeErrorId = useId()
  const confidenceMinErrorId = useId()
  const initialMemberWidgetTypeErrorId = useId()
  const initialMemberLabelEnErrorId = useId()
  const initialMemberLabelGuErrorId = useId()

  const dialogRef = useRef<HTMLDivElement>(null)
  const controlRefs = useRef<
    Partial<
      Record<
        ConfiguredAddFocusControl,
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
      >
    >
  >({})
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  const palette = getPaletteWidget(pending.widgetType)
  const widgetLabel =
    locale === 'gu'
      ? (palette?.labelGu ?? pending.widgetType)
      : (palette?.labelEn ?? pending.widgetType)

  const invalid = pending.showValidation
  const focusRequestId = focusRequest?.requestId ?? null
  const focusControl = focusRequest?.control ?? null

  useEffect(() => {
    if (focusRequestId === null || focusControl === null) {
      return
    }
    const timer = window.setTimeout(() => {
      controlRefs.current[focusControl]?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [focusRequestId, focusControl])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancelRef.current()
        return
      }
      if (event.key !== 'Tab') {
        return
      }
      const dialog = dialogRef.current
      if (dialog === null) {
        return
      }
      const focusable = listFocusable(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || active === null || !dialog.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || active === null || !dialog.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const showMasterListIdError =
    invalid &&
    (pending.widgetType === 'dropdown-master' ||
      pending.widgetType === 'radio' ||
      pending.widgetType === 'multiselect') &&
    focusControl === 'masterListId'

  return (
    <div className="dg20-builder-configured-add-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="dg20-builder-configured-add"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid="configured-add-dialog"
      >
        <h2 id={titleId} className="dg20-builder-configured-add__title">
          {builderMessage(locale, 'configuredAddTitle', { label: widgetLabel })}
        </h2>
        <p id={descriptionId} className="dg20-builder-configured-add__body">
          {builderMessage(locale, 'configuredAddGuidance')}
        </p>

        {(pending.widgetType === 'dropdown-master' ||
          pending.widgetType === 'radio' ||
          pending.widgetType === 'multiselect') && (
          <div className="dg20-builder-editor__field">
            <label className="dg20-builder-label" htmlFor={masterListIdInputId}>
              {builderMessage(locale, 'configuredAddMasterListId')}
            </label>
            <input
              ref={(el) => {
                controlRefs.current.masterListId = el
              }}
              id={masterListIdInputId}
              className="dg20-builder-search-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={pending.masterListId}
              aria-invalid={showMasterListIdError || undefined}
              aria-describedby={
                showMasterListIdError ? `${descriptionId} ${masterListIdErrorId}` : descriptionId
              }
              data-testid="configured-add-master-list-id"
              onChange={(event) => onPatch({ masterListId: event.target.value })}
            />
            {showMasterListIdError && (
              <p id={masterListIdErrorId} className="dg20-builder-editor__error" role="alert">
                {builderMessage(locale, 'editorErrorMasterListIdInvalid')}
              </p>
            )}
          </div>
        )}

        {pending.widgetType === 'multiselect' && (
          <>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={minItemsInputId}>
                {builderMessage(locale, 'configuredAddMinItems')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.minItems = el
                }}
                id={minItemsInputId}
                className="dg20-builder-search-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={pending.minItems}
                aria-invalid={(invalid && focusControl === 'minItems') || undefined}
                aria-describedby={
                  invalid && focusControl === 'minItems'
                    ? `${descriptionId} ${minItemsErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-min-items"
                onChange={(event) => onPatch({ minItems: event.target.value })}
              />
              {invalid && focusControl === 'minItems' && (
                <p id={minItemsErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorMinItemsInvalid')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={maxItemsInputId}>
                {builderMessage(locale, 'configuredAddMaxItems')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.maxItems = el
                }}
                id={maxItemsInputId}
                className="dg20-builder-search-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={pending.maxItems}
                aria-invalid={(invalid && focusControl === 'maxItems') || undefined}
                aria-describedby={
                  invalid && focusControl === 'maxItems'
                    ? `${descriptionId} ${maxItemsErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-max-items"
                onChange={(event) => onPatch({ maxItems: event.target.value })}
              />
              {invalid && focusControl === 'maxItems' && (
                <p id={maxItemsErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(
                    locale,
                    focusControl === 'maxItems' && pending.minItems.length > 0
                      ? 'editorErrorItemsRangeInvalid'
                      : 'editorErrorMaxItemsInvalid',
                  )}
                </p>
              )}
            </div>
          </>
        )}

        {pending.widgetType === 'cascading-dropdown' && (
          <>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={parentMasterListIdInputId}>
                {builderMessage(locale, 'configuredAddParentMasterListId')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.parentMasterListId = el
                }}
                id={parentMasterListIdInputId}
                className="dg20-builder-search-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={pending.parentMasterListId}
                aria-invalid={(invalid && focusControl === 'parentMasterListId') || undefined}
                aria-describedby={
                  invalid && focusControl === 'parentMasterListId'
                    ? `${descriptionId} ${parentErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-parent-master-list-id"
                onChange={(event) => onPatch({ parentMasterListId: event.target.value })}
              />
              {invalid && focusControl === 'parentMasterListId' && (
                <p id={parentErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorParentMasterListIdInvalid')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={childMasterListIdInputId}>
                {builderMessage(locale, 'configuredAddChildMasterListId')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.childMasterListId = el
                }}
                id={childMasterListIdInputId}
                className="dg20-builder-search-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={pending.childMasterListId}
                aria-invalid={(invalid && focusControl === 'childMasterListId') || undefined}
                aria-describedby={
                  invalid && focusControl === 'childMasterListId'
                    ? `${descriptionId} ${childErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-child-master-list-id"
                onChange={(event) => onPatch({ childMasterListId: event.target.value })}
              />
              {invalid && focusControl === 'childMasterListId' && (
                <p id={childErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorChildMasterListIdInvalid')}
                </p>
              )}
            </div>
          </>
        )}

        {pending.widgetType === 'doc-upload' && (
          <>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={allowedMimeTypesInputId}>
                {builderMessage(locale, 'configuredAddAllowedMimeTypes')}
              </label>
              <textarea
                ref={(el) => {
                  controlRefs.current.allowedMimeTypesText = el
                }}
                id={allowedMimeTypesInputId}
                className="dg20-builder-search-input"
                rows={4}
                spellCheck={false}
                value={pending.allowedMimeTypesText}
                aria-invalid={(invalid && focusControl === 'allowedMimeTypesText') || undefined}
                aria-describedby={
                  invalid && focusControl === 'allowedMimeTypesText'
                    ? `${descriptionId} ${allowedMimeErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-allowed-mime-types"
                onChange={(event) => onPatch({ allowedMimeTypesText: event.target.value })}
              />
              {invalid && focusControl === 'allowedMimeTypesText' && (
                <p id={allowedMimeErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorAllowedMimeTypesInvalid')}
                </p>
              )}
              <p className="dg20-builder-editor__hint">
                {builderMessage(locale, 'editorAllowedMimeTypesHint')}
              </p>
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={maxFileSizeBytesInputId}>
                {builderMessage(locale, 'configuredAddMaxFileSizeBytes')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.maxFileSizeBytes = el
                }}
                id={maxFileSizeBytesInputId}
                className="dg20-builder-search-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={pending.maxFileSizeBytes}
                aria-invalid={(invalid && focusControl === 'maxFileSizeBytes') || undefined}
                aria-describedby={
                  invalid && focusControl === 'maxFileSizeBytes'
                    ? `${descriptionId} ${maxFileSizeErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-max-file-size-bytes"
                onChange={(event) => onPatch({ maxFileSizeBytes: event.target.value })}
              />
              {invalid && focusControl === 'maxFileSizeBytes' && (
                <p id={maxFileSizeErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorMaxFileSizeBytesInvalid')}
                </p>
              )}
              <p className="dg20-builder-editor__hint">
                {builderMessage(locale, 'editorMaxFileSizeBytesHint')}
              </p>
            </div>
          </>
        )}

        {pending.widgetType === 'digilocker-fetch' && (
          <div className="dg20-builder-editor__field">
            <label className="dg20-builder-label" htmlFor={digiLockerCodeInputId}>
              {builderMessage(locale, 'configuredAddDigiLockerDocumentTypeCode')}
            </label>
            <input
              ref={(el) => {
                controlRefs.current.digiLockerDocumentTypeCode = el
              }}
              id={digiLockerCodeInputId}
              className="dg20-builder-search-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={pending.digiLockerDocumentTypeCode}
              aria-invalid={(invalid && focusControl === 'digiLockerDocumentTypeCode') || undefined}
              aria-describedby={
                invalid && focusControl === 'digiLockerDocumentTypeCode'
                  ? `${descriptionId} ${digiLockerErrorId}`
                  : descriptionId
              }
              data-testid="configured-add-digilocker-document-type-code"
              onChange={(event) => onPatch({ digiLockerDocumentTypeCode: event.target.value })}
            />
            {invalid && focusControl === 'digiLockerDocumentTypeCode' && (
              <p id={digiLockerErrorId} className="dg20-builder-editor__error" role="alert">
                {builderMessage(locale, 'editorErrorDigiLockerDocumentTypeCodeInvalid')}
              </p>
            )}
            <p className="dg20-builder-editor__hint">
              {builderMessage(locale, 'editorDigiLockerDocumentTypeCodeHint')}
            </p>
          </div>
        )}

        {pending.widgetType === 'fee-field' && (
          <div className="dg20-builder-editor__field">
            <label className="dg20-builder-label" htmlFor={feeRuleIdInputId}>
              {builderMessage(locale, 'configuredAddFeeRuleId')}
            </label>
            <input
              ref={(el) => {
                controlRefs.current.feeRuleId = el
              }}
              id={feeRuleIdInputId}
              className="dg20-builder-search-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={pending.feeRuleId}
              aria-invalid={(invalid && focusControl === 'feeRuleId') || undefined}
              aria-describedby={
                invalid && focusControl === 'feeRuleId'
                  ? `${descriptionId} ${feeRuleIdErrorId}`
                  : descriptionId
              }
              data-testid="configured-add-fee-rule-id"
              onChange={(event) => onPatch({ feeRuleId: event.target.value })}
            />
            {invalid && focusControl === 'feeRuleId' && (
              <p id={feeRuleIdErrorId} className="dg20-builder-editor__error" role="alert">
                {builderMessage(locale, 'editorErrorFeeRuleIdInvalid')}
              </p>
            )}
            <p className="dg20-builder-editor__hint">
              {builderMessage(locale, 'editorFeeFieldPolicyHint')}
            </p>
          </div>
        )}

        {pending.widgetType === 'eligibility-declaration' && (
          <>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={declarationIdInputId}>
                {builderMessage(locale, 'configuredAddDeclarationId')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.declarationId = el
                }}
                id={declarationIdInputId}
                className="dg20-builder-search-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={pending.declarationId}
                aria-invalid={(invalid && focusControl === 'declarationId') || undefined}
                aria-describedby={
                  invalid && focusControl === 'declarationId'
                    ? `${descriptionId} ${declarationIdErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-declaration-id"
                onChange={(event) => onPatch({ declarationId: event.target.value })}
              />
              {invalid && focusControl === 'declarationId' && (
                <p id={declarationIdErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorDeclarationIdInvalid')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={declarationTextEnInputId}>
                {builderMessage(locale, 'configuredAddDeclarationTextEn')}
              </label>
              <textarea
                ref={(el) => {
                  controlRefs.current.declarationTextEn = el
                }}
                id={declarationTextEnInputId}
                className="dg20-builder-editor__textarea"
                rows={4}
                value={pending.declarationTextEn}
                aria-invalid={(invalid && focusControl === 'declarationTextEn') || undefined}
                aria-describedby={
                  invalid && focusControl === 'declarationTextEn'
                    ? `${descriptionId} ${declarationTextEnErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-declaration-text-en"
                onChange={(event) => onPatch({ declarationTextEn: event.target.value })}
              />
              {invalid && focusControl === 'declarationTextEn' && (
                <p
                  id={declarationTextEnErrorId}
                  className="dg20-builder-editor__error"
                  role="alert"
                >
                  {builderMessage(locale, 'editorErrorDeclarationTextEnInvalid')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={declarationTextGuInputId}>
                {builderMessage(locale, 'configuredAddDeclarationTextGu')}
              </label>
              <textarea
                ref={(el) => {
                  controlRefs.current.declarationTextGu = el
                }}
                id={declarationTextGuInputId}
                className="dg20-builder-editor__textarea"
                rows={4}
                value={pending.declarationTextGu}
                aria-invalid={(invalid && focusControl === 'declarationTextGu') || undefined}
                aria-describedby={
                  invalid && focusControl === 'declarationTextGu'
                    ? `${descriptionId} ${declarationTextGuErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-declaration-text-gu"
                onChange={(event) => onPatch({ declarationTextGu: event.target.value })}
              />
              {invalid && focusControl === 'declarationTextGu' && (
                <p
                  id={declarationTextGuErrorId}
                  className="dg20-builder-editor__error"
                  role="alert"
                >
                  {builderMessage(locale, 'editorErrorDeclarationTextGuInvalid')}
                </p>
              )}
            </div>
            <p className="dg20-builder-editor__hint">
              {builderMessage(locale, 'editorEligibilityDeclarationPolicyHint')}
            </p>
          </>
        )}

        {pending.widgetType === 'caf-prefill' && (
          <>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={cafAttributeInputId}>
                {builderMessage(locale, 'configuredAddCafAttribute')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.cafAttribute = el
                }}
                id={cafAttributeInputId}
                className="dg20-builder-search-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={pending.cafAttribute}
                aria-invalid={(invalid && focusControl === 'cafAttribute') || undefined}
                aria-describedby={
                  invalid && focusControl === 'cafAttribute'
                    ? `${descriptionId} ${cafAttributeErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-caf-attribute"
                onChange={(event) => onPatch({ cafAttribute: event.target.value })}
              />
              {invalid && focusControl === 'cafAttribute' && (
                <p id={cafAttributeErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorCafAttributeInvalid')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={confidenceMinInputId}>
                {builderMessage(locale, 'configuredAddConfidenceMin')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.confidenceMin = el
                }}
                id={confidenceMinInputId}
                className="dg20-builder-search-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={pending.confidenceMin}
                aria-invalid={(invalid && focusControl === 'confidenceMin') || undefined}
                aria-describedby={
                  invalid && focusControl === 'confidenceMin'
                    ? `${descriptionId} ${confidenceMinErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-confidence-min"
                onChange={(event) => onPatch({ confidenceMin: event.target.value })}
              />
              {invalid && focusControl === 'confidenceMin' && (
                <p id={confidenceMinErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorConfidenceMinInvalid')}
                </p>
              )}
            </div>
            <p className="dg20-builder-editor__hint">
              {builderMessage(locale, 'editorCafPrefillPolicyHint')}
            </p>
          </>
        )}

        {pending.widgetType === 'family-repeater' && (
          <>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={maxItemsInputId}>
                {builderMessage(locale, 'configuredAddMaxItems')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.maxItems = el
                }}
                id={maxItemsInputId}
                className="dg20-builder-search-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={pending.maxItems}
                aria-invalid={(invalid && focusControl === 'maxItems') || undefined}
                aria-describedby={
                  invalid && focusControl === 'maxItems'
                    ? `${descriptionId} ${maxItemsErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-max-items"
                onChange={(event) => onPatch({ maxItems: event.target.value })}
              />
              {invalid && focusControl === 'maxItems' && (
                <p id={maxItemsErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorMaxItemsInvalid')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={minItemsInputId}>
                {builderMessage(locale, 'configuredAddMinItems')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.minItems = el
                }}
                id={minItemsInputId}
                className="dg20-builder-search-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={pending.minItems}
                aria-invalid={(invalid && focusControl === 'minItems') || undefined}
                aria-describedby={
                  invalid && focusControl === 'minItems'
                    ? `${descriptionId} ${minItemsErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-min-items"
                onChange={(event) => onPatch({ minItems: event.target.value })}
              />
              {invalid && focusControl === 'minItems' && (
                <p id={minItemsErrorId} className="dg20-builder-editor__error" role="alert">
                  {builderMessage(locale, 'editorErrorMinItemsInvalid')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={initialMemberWidgetTypeId}>
                {builderMessage(locale, 'configuredAddInitialMemberWidgetType')}
              </label>
              <select
                ref={(el) => {
                  controlRefs.current.initialMemberWidgetType = el as unknown as HTMLInputElement
                }}
                id={initialMemberWidgetTypeId}
                className="dg20-builder-search-input"
                value={pending.initialMemberWidgetType}
                aria-invalid={(invalid && focusControl === 'initialMemberWidgetType') || undefined}
                aria-describedby={
                  invalid && focusControl === 'initialMemberWidgetType'
                    ? `${descriptionId} ${initialMemberWidgetTypeErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-initial-member-widget-type"
                onChange={(event) =>
                  onPatch({
                    initialMemberWidgetType: event.target.value as '' | FamilyMemberWidgetType,
                  })
                }
              >
                <option value="">—</option>
                {FAMILY_MEMBER_WIDGET_TYPES.map((type) => {
                  const memberPalette = getPaletteWidget(type)
                  const label =
                    locale === 'gu'
                      ? (memberPalette?.labelGu ?? type)
                      : (memberPalette?.labelEn ?? type)
                  return (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  )
                })}
              </select>
              {invalid && focusControl === 'initialMemberWidgetType' && (
                <p
                  id={initialMemberWidgetTypeErrorId}
                  className="dg20-builder-editor__error"
                  role="alert"
                >
                  {builderMessage(locale, 'configuredAddInitialMemberWidgetType')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={initialMemberLabelEnId}>
                {builderMessage(locale, 'configuredAddInitialMemberLabelEn')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.initialMemberLabelEn = el
                }}
                id={initialMemberLabelEnId}
                className="dg20-builder-search-input"
                type="text"
                value={pending.initialMemberLabelEn}
                aria-invalid={(invalid && focusControl === 'initialMemberLabelEn') || undefined}
                aria-describedby={
                  invalid && focusControl === 'initialMemberLabelEn'
                    ? `${descriptionId} ${initialMemberLabelEnErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-initial-member-label-en"
                onChange={(event) => onPatch({ initialMemberLabelEn: event.target.value })}
              />
              {invalid && focusControl === 'initialMemberLabelEn' && (
                <p
                  id={initialMemberLabelEnErrorId}
                  className="dg20-builder-editor__error"
                  role="alert"
                >
                  {builderMessage(locale, 'editorErrorLabelEnRequired')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-label" htmlFor={initialMemberLabelGuId}>
                {builderMessage(locale, 'configuredAddInitialMemberLabelGu')}
              </label>
              <input
                ref={(el) => {
                  controlRefs.current.initialMemberLabelGu = el
                }}
                id={initialMemberLabelGuId}
                className="dg20-builder-search-input"
                type="text"
                value={pending.initialMemberLabelGu}
                aria-invalid={(invalid && focusControl === 'initialMemberLabelGu') || undefined}
                aria-describedby={
                  invalid && focusControl === 'initialMemberLabelGu'
                    ? `${descriptionId} ${initialMemberLabelGuErrorId}`
                    : descriptionId
                }
                data-testid="configured-add-initial-member-label-gu"
                onChange={(event) => onPatch({ initialMemberLabelGu: event.target.value })}
              />
              {invalid && focusControl === 'initialMemberLabelGu' && (
                <p
                  id={initialMemberLabelGuErrorId}
                  className="dg20-builder-editor__error"
                  role="alert"
                >
                  {builderMessage(locale, 'editorErrorLabelGuRequired')}
                </p>
              )}
            </div>
            <div className="dg20-builder-editor__field">
              <label className="dg20-builder-checkbox-label">
                <input
                  type="checkbox"
                  checked={pending.initialMemberRequired}
                  data-testid="configured-add-initial-member-required"
                  onChange={(event) => onPatch({ initialMemberRequired: event.target.checked })}
                />
                {builderMessage(locale, 'configuredAddInitialMemberRequired')}
              </label>
            </div>
          </>
        )}

        <div className="dg20-builder-configured-add__actions">
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            data-testid="configured-add-confirm"
            onClick={onConfirm}
          >
            {builderMessage(locale, 'configuredAddConfirm')}
          </button>
          <button
            type="button"
            className="dg20-builder-field-action-btn"
            data-testid="configured-add-cancel"
            onClick={onCancel}
          >
            {builderMessage(locale, 'configuredAddCancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

import {
  assessMultiselectIncomingValue,
  emitMultiselectCodes,
  masterDataOptionLabel,
  orderCodesByOptions,
  resolveMasterListId,
  resolveMultiselectItemBounds,
  resolveMultiselectSelectedCodes,
  shouldShowMultiselectInvalidValue,
} from '../runtime/master-data.js'
import { useMasterDataOptions } from '../runtime/use-master-data-options.js'
import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20WidgetProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/**
 * Master-data multiselect checkbox group. Emits unique option codes in adapter order.
 * Bounds come from JSON Schema minItems/maxItems — never ui:options and never a
 * virtual required minimum (FB-D10.1).
 */
export function MultiselectWidget(props: Dg20WidgetProps) {
  const {
    id,
    name,
    value,
    required,
    disabled,
    readonly,
    onChange,
    schema,
    rawErrors,
    idSchema,
    label,
  } = props

  const chrome = useFieldChrome({
    idSchema,
    id,
    name,
    label,
    required,
    rawErrors,
    schema,
  })

  const extensions = parseDg20Extensions(schema)
  const listResolution = resolveMasterListId(extensions.masterListId)
  const bounds = resolveMultiselectItemBounds(schema)
  const configOk = listResolution.ok && bounds.ok
  const adapter = chrome.runtime.services?.masterData
  const locale = chrome.runtime.locale
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const load = useMasterDataOptions({
    fieldId: chrome.instanceFieldId,
    masterListId: listResolution.ok ? listResolution.masterListId : undefined,
    listIdOk: configOk,
    adapter,
  })

  const assessment = assessMultiselectIncomingValue(value)
  const maxItems = bounds.ok ? bounds.maxItems : undefined
  const minItems = bounds.ok ? bounds.minItems : undefined
  // JSON Schema is authoritative — never invent a virtual required minimum (FB-D10.1).
  const selectedCodes = resolveMultiselectSelectedCodes({
    assessment,
    loadStatus: load.status,
    options: load.options,
    maxItems,
  })
  const selectedSet = new Set(selectedCodes)
  const showInvalidValue = shouldShowMultiselectInvalidValue({
    assessment,
    loadStatus: load.status,
    options: load.options,
    maxItems,
  })
  const belowMinimum =
    minItems !== undefined &&
    load.status === 'ready' &&
    !showInvalidValue &&
    selectedCodes.length < minItems &&
    (assessment.kind === 'unanswered' || assessment.kind === 'candidate')

  const statusId = `${id}__master-status`
  const politeStatus =
    load.status === 'loading'
      ? chrome.message('masterDataLoading')
      : load.status === 'unavailable'
        ? chrome.message('masterDataUnavailable')
        : load.status === 'empty'
          ? chrome.message('masterDataEmpty')
          : ''

  const displayErrors = [
    ...chrome.errorMessages,
    ...(showInvalidValue ? [chrome.message('multiselectInvalidValue')] : []),
    ...(belowMinimum && chrome.errorMessages.length === 0
      ? [chrome.message('multiselectBelowMinimum', { count: minItems })]
      : []),
    ...(!configOk || load.status === 'invalid-config'
      ? [chrome.message('multiselectConfigInvalid')]
      : []),
    ...(load.status === 'failed' ? [chrome.message('masterDataLoadFailed')] : []),
  ]
  // Deduplicate identical alert strings (config may surface twice via invalid-config status).
  const uniqueErrors = [...new Set(displayErrors)]
  const hasError = uniqueErrors.length > 0
  const errorId = hasError ? `${id}__error` : undefined
  const describedBy =
    [chrome.helpId, politeStatus ? statusId : undefined, errorId].filter(Boolean).join(' ') ||
    undefined

  const optionsInteractive = !isDisabled && !isReadOnly && load.status === 'ready' && configOk
  const atMax = maxItems !== undefined && selectedCodes.length >= maxItems
  const canRetry = load.status === 'failed' && !isReadOnly && !isDisabled

  function toggle(code: string) {
    if (!optionsInteractive) {
      return
    }
    const next = new Set(selectedSet)
    if (next.has(code)) {
      next.delete(code)
    } else {
      if (atMax) {
        return
      }
      next.add(code)
    }
    onChange(emitMultiselectCodes(orderCodesByOptions([...next], load.options)))
  }

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="multiselect"
      aria-describedby={describedBy}
      aria-invalid={hasError || undefined}
    >
      <legend className="dg20-label">
        <span>{chrome.label.text}</span>
        {required ? (
          <span className="dg20-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>
      {chrome.help.text ? (
        <p className="dg20-help" id={chrome.helpId}>
          {chrome.help.text}
        </p>
      ) : null}
      {load.status === 'ready' ? (
        <div className="dg20-radio-group" role="presentation">
          {load.options.map((option, index) => {
            const optionId = `${id}__option_${index}`
            const checked = selectedSet.has(option.code)
            const optionDisabled = !optionsInteractive || (atMax && !checked)
            return (
              <label key={option.code} className="dg20-radio-option" htmlFor={optionId}>
                <input
                  id={optionId}
                  type="checkbox"
                  name={name}
                  value={option.code}
                  className="dg20-radio"
                  checked={checked}
                  disabled={optionDisabled}
                  onChange={() => {
                    toggle(option.code)
                  }}
                />
                <span>{masterDataOptionLabel(option, locale)}</span>
              </label>
            )
          })}
        </div>
      ) : null}
      {politeStatus ? (
        <p className="dg20-status" id={statusId} role="status" aria-live="polite">
          {politeStatus}
        </p>
      ) : null}
      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {uniqueErrors.join(' ')}
          {canRetry ? (
            <>
              {' '}
              <button
                type="button"
                className="dg20-button dg20-button-secondary"
                onClick={load.reload}
              >
                {chrome.message('retry')}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </fieldset>
  )
}

import {
  assessMasterChoiceIncomingValue,
  masterDataOptionLabel,
  resolveMasterChoiceSelectedCode,
  resolveMasterListId,
  shouldShowMasterChoiceInvalidValue,
} from '../runtime/master-data.js'
import { useMasterDataOptions } from '../runtime/use-master-data-options.js'
import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20WidgetProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/**
 * Single-select master-data radio group. Emits option codes only.
 * Options come from MasterDataAdapter + x-dg20.masterListId — never schema enum.
 * DOM IDs use ordinal suffixes — never raw option codes.
 */
export function RadioMasterWidget(props: Dg20WidgetProps) {
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
  const adapter = chrome.runtime.services?.masterData
  const locale = chrome.runtime.locale
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const load = useMasterDataOptions({
    fieldId: chrome.instanceFieldId,
    masterListId: listResolution.ok ? listResolution.masterListId : undefined,
    listIdOk: listResolution.ok,
    adapter,
  })

  const assessment = assessMasterChoiceIncomingValue(value)
  const selected = resolveMasterChoiceSelectedCode({
    assessment,
    loadStatus: load.status,
    options: load.options,
  })
  const showInvalidValue = shouldShowMasterChoiceInvalidValue({
    assessment,
    loadStatus: load.status,
    options: load.options,
  })

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
    ...(showInvalidValue ? [chrome.message('masterDataUnknownValue')] : []),
    ...(load.status === 'invalid-config' ? [chrome.message('masterDataConfigInvalid')] : []),
    ...(load.status === 'failed' ? [chrome.message('masterDataLoadFailed')] : []),
  ]
  const hasError = displayErrors.length > 0
  const errorId = hasError ? `${id}__error` : undefined
  const describedBy =
    [chrome.helpId, politeStatus ? statusId : undefined, errorId].filter(Boolean).join(' ') ||
    undefined

  const optionsDisabled =
    isDisabled ||
    load.status === 'loading' ||
    load.status === 'unavailable' ||
    load.status === 'invalid-config' ||
    load.status === 'failed' ||
    load.status === 'empty'

  const canRetry = load.status === 'failed' && !isReadOnly && !isDisabled

  function select(code: string) {
    if (isDisabled || isReadOnly || optionsDisabled) {
      return
    }
    onChange(code)
  }

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="radio"
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
            return (
              <label key={option.code} className="dg20-radio-option" htmlFor={optionId}>
                <input
                  id={optionId}
                  type="radio"
                  name={name}
                  value={option.code}
                  className="dg20-radio"
                  checked={selected === option.code}
                  disabled={optionsDisabled || isReadOnly}
                  required={required && selected === undefined}
                  onChange={(event) => {
                    if (isReadOnly) {
                      event.preventDefault()
                      return
                    }
                    select(option.code)
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
          {displayErrors.join(' ')}
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

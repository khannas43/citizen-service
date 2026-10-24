import type { ChangeEvent } from 'react'

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
 * Single-select master-data dropdown. Emits option codes only.
 * Options come from MasterDataAdapter + x-dg20.masterListId — never schema enum.
 */
export function DropdownMasterWidget(props: Dg20WidgetProps) {
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

  const controlDisabled =
    isDisabled ||
    isReadOnly ||
    load.status === 'loading' ||
    load.status === 'unavailable' ||
    load.status === 'invalid-config' ||
    load.status === 'failed' ||
    load.status === 'empty'

  const canRetry = load.status === 'failed' && !isReadOnly && !isDisabled

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    if (isDisabled || isReadOnly) {
      return
    }
    const next = event.target.value
    onChange(next === '' ? undefined : next)
  }

  return (
    <div className="dg20-field" lang={chrome.lang} data-dg20-widget="dropdown-master">
      <label className="dg20-label" htmlFor={id}>
        <span>{chrome.label.text}</span>
        {required ? (
          <span className="dg20-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {chrome.help.text ? (
        <p className="dg20-help" id={chrome.helpId}>
          {chrome.help.text}
        </p>
      ) : null}
      <select
        id={id}
        name={name}
        className="dg20-control"
        value={selected ?? ''}
        required={required}
        disabled={controlDisabled}
        aria-invalid={hasError || undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        onChange={handleChange}
      >
        <option value="">{chrome.message('masterDataSelectPlaceholder')}</option>
        {load.options.map((option) => (
          <option key={option.code} value={option.code}>
            {masterDataOptionLabel(option, locale)}
          </option>
        ))}
      </select>
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
    </div>
  )
}

import type { ChangeEvent } from 'react'

import {
  assessCascadingIncomingValue,
  isKnownMasterDataCode,
  masterDataOptionLabel,
  resolveCascadingListIds,
  type CascadingDropdownValue,
} from '../runtime/master-data.js'
import { useMasterDataOptions } from '../runtime/use-master-data-options.js'
import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

export type { CascadingDropdownValue }

/**
 * Parent→child cascading selects from master-data lists.
 * Emits codes only. Child requests include parentCode. No effect-driven onChange.
 */
export function CascadingDropdownWidget(props: Dg20FieldProps) {
  const { formData, required, disabled, readonly, onChange, schema, rawErrors, idSchema, name } =
    props

  const id = idSchema.$id
  const chrome = useFieldChrome({
    idSchema,
    name,
    label: schema.title,
    required: Boolean(required),
    rawErrors,
    schema,
  })

  const extensions = parseDg20Extensions(schema)
  const lists = resolveCascadingListIds({
    parentMasterListId: extensions.parentMasterListId,
    childMasterListId: extensions.childMasterListId,
  })
  const adapter = chrome.runtime.services?.masterData
  const locale = chrome.runtime.locale
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const assessment = assessCascadingIncomingValue(formData)

  const parentLoad = useMasterDataOptions({
    fieldId: chrome.instanceFieldId,
    masterListId: lists.ok ? lists.parentMasterListId : undefined,
    listIdOk: lists.ok,
    adapter,
  })

  const parentCandidate = assessment.kind === 'candidate' ? assessment.parentCode : undefined
  const parentKnown =
    parentLoad.status === 'ready' &&
    parentCandidate !== undefined &&
    isKnownMasterDataCode(parentCandidate, parentLoad.options)
  const parentSelected = parentLoad.status === 'ready' && parentKnown ? parentCandidate : undefined

  const childEnabled = Boolean(lists.ok && parentSelected)
  const childLoad = useMasterDataOptions({
    fieldId: chrome.instanceFieldId,
    masterListId: lists.ok ? lists.childMasterListId : undefined,
    listIdOk: lists.ok,
    adapter,
    enabled: childEnabled,
    parentCode: parentSelected,
  })

  const childCandidate = assessment.kind === 'candidate' ? assessment.childCode : undefined
  const childKnown =
    childLoad.status === 'ready' &&
    childCandidate !== undefined &&
    isKnownMasterDataCode(childCandidate, childLoad.options)
  const childSelected = childLoad.status === 'ready' && childKnown ? childCandidate : undefined

  const parentUnknown =
    (parentLoad.status === 'ready' || parentLoad.status === 'empty') &&
    assessment.kind === 'candidate' &&
    !parentKnown
  const childUnknown =
    childEnabled &&
    (childLoad.status === 'ready' || childLoad.status === 'empty') &&
    assessment.kind === 'candidate' &&
    childCandidate !== undefined &&
    !childKnown
  const showInvalidValue = assessment.kind === 'malformed' || parentUnknown || childUnknown

  const parentStatusId = `${id}__parent-status`
  const childStatusId = `${id}__child-status`
  const parentPolite =
    parentLoad.status === 'loading'
      ? chrome.message('masterDataLoading')
      : parentLoad.status === 'unavailable'
        ? chrome.message('masterDataUnavailable')
        : parentLoad.status === 'empty'
          ? chrome.message('masterDataEmpty')
          : ''
  const childPolite = !childEnabled
    ? chrome.message('cascadingSelectParentFirst')
    : childLoad.status === 'loading'
      ? chrome.message('masterDataLoading')
      : childLoad.status === 'unavailable'
        ? chrome.message('masterDataUnavailable')
        : childLoad.status === 'empty'
          ? chrome.message('masterDataEmpty')
          : childLoad.status === 'idle'
            ? chrome.message('cascadingSelectParentFirst')
            : ''

  const displayErrors = [
    ...chrome.errorMessages,
    ...(showInvalidValue ? [chrome.message('cascadingInvalidValue')] : []),
    ...(!lists.ok || parentLoad.status === 'invalid-config'
      ? [chrome.message('cascadingConfigInvalid')]
      : []),
    ...(parentLoad.status === 'failed' || childLoad.status === 'failed'
      ? [chrome.message('masterDataLoadFailed')]
      : []),
  ]
  const uniqueErrors = [...new Set(displayErrors)]
  const hasError = uniqueErrors.length > 0
  const errorId = hasError ? `${id}__error` : undefined
  const describedBy =
    [
      chrome.helpId,
      parentPolite ? parentStatusId : undefined,
      childPolite ? childStatusId : undefined,
      errorId,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  const parentDisabled =
    isDisabled ||
    isReadOnly ||
    !lists.ok ||
    parentLoad.status === 'loading' ||
    parentLoad.status === 'unavailable' ||
    parentLoad.status === 'invalid-config' ||
    parentLoad.status === 'failed' ||
    parentLoad.status === 'empty'

  const childDisabled =
    isDisabled ||
    isReadOnly ||
    !childEnabled ||
    childLoad.status === 'loading' ||
    childLoad.status === 'unavailable' ||
    childLoad.status === 'failed' ||
    childLoad.status === 'empty' ||
    childLoad.status === 'idle'

  const canRetryParent = parentLoad.status === 'failed' && !isReadOnly && !isDisabled
  const canRetryChild = childLoad.status === 'failed' && !isReadOnly && !isDisabled

  function handleParentChange(event: ChangeEvent<HTMLSelectElement>) {
    if (isDisabled || isReadOnly) {
      return
    }
    const next = event.target.value
    if (next === '') {
      onChange(undefined)
      return
    }
    onChange({ parentCode: next } satisfies CascadingDropdownValue)
  }

  function handleChildChange(event: ChangeEvent<HTMLSelectElement>) {
    if (isDisabled || isReadOnly || !parentSelected) {
      return
    }
    const next = event.target.value
    if (next === '') {
      onChange({ parentCode: parentSelected } satisfies CascadingDropdownValue)
      return
    }
    onChange({
      parentCode: parentSelected,
      childCode: next,
    } satisfies CascadingDropdownValue)
  }

  const parentSelectId = `${id}__parent`
  const childSelectId = `${id}__child`

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="cascading-dropdown"
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

      <div className="dg20-name-part">
        <label className="dg20-sublabel" htmlFor={parentSelectId}>
          {chrome.message('cascadingParentLabel')}
        </label>
        <select
          id={parentSelectId}
          className="dg20-control"
          value={parentSelected ?? ''}
          disabled={parentDisabled}
          required={Boolean(required)}
          aria-describedby={parentPolite ? parentStatusId : undefined}
          onChange={handleParentChange}
        >
          <option value="">{chrome.message('masterDataSelectPlaceholder')}</option>
          {parentLoad.options.map((option) => (
            <option key={option.code} value={option.code}>
              {masterDataOptionLabel(option, locale)}
            </option>
          ))}
        </select>
        {parentPolite ? (
          <p className="dg20-status" id={parentStatusId} role="status" aria-live="polite">
            {parentPolite}
          </p>
        ) : null}
      </div>

      <div className="dg20-name-part">
        <label className="dg20-sublabel" htmlFor={childSelectId}>
          {chrome.message('cascadingChildLabel')}
        </label>
        <select
          id={childSelectId}
          className="dg20-control"
          value={childSelected ?? ''}
          disabled={childDisabled}
          aria-describedby={childPolite ? childStatusId : undefined}
          onChange={handleChildChange}
        >
          <option value="">{chrome.message('masterDataSelectPlaceholder')}</option>
          {childLoad.options.map((option) => (
            <option key={option.code} value={option.code}>
              {masterDataOptionLabel(option, locale)}
            </option>
          ))}
        </select>
        {childPolite ? (
          <p className="dg20-status" id={childStatusId} role="status" aria-live="polite">
            {childPolite}
          </p>
        ) : null}
      </div>

      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {uniqueErrors.join(' ')}
          {canRetryParent ? (
            <>
              {' '}
              <button
                type="button"
                className="dg20-button dg20-button-secondary"
                onClick={parentLoad.reload}
              >
                {chrome.message('retry')}
              </button>
            </>
          ) : null}
          {canRetryChild ? (
            <>
              {' '}
              <button
                type="button"
                className="dg20-button dg20-button-secondary"
                onClick={childLoad.reload}
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

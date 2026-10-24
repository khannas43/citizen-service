import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import {
  acceptConsentLoggingResult,
  assessEligibilityDeclarationIncomingValue,
  emitEligibilityDeclarationValue,
  resolveDeclarationId,
  type EligibilityDeclarationValue,
} from '../runtime/eligibility-declaration.js'
import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

export type { EligibilityDeclarationValue }

type UiState = 'idle' | 'recording' | 'unavailable' | 'invalid-config' | 'failed'

function baseUiState(
  configOk: boolean,
  adapterPresent: boolean,
): Exclude<UiState, 'recording' | 'failed'> {
  if (!configOk) {
    return 'invalid-config'
  }
  if (!adapterPresent) {
    return 'unavailable'
  }
  return 'idle'
}

/**
 * Consent-linked eligibility declaration (provisional FB-A9 contract).
 * Host ConsentLoggingAdapter owns ledger persistence and timestamps.
 * Checkbox has no `name` — native FormData never serializes an unreceipted decision.
 */
export function EligibilityDeclarationWidget(props: Dg20FieldProps) {
  const { formData, disabled, readonly, onChange, schema, rawErrors, idSchema, name } = props

  const id = idSchema.$id
  const chrome = useFieldChrome({
    idSchema,
    name,
    label: schema.title,
    required: false,
    rawErrors,
    schema,
  })

  const extensions = parseDg20Extensions(schema)
  const declarationResolution = resolveDeclarationId(extensions.declarationId)
  const declarationId = declarationResolution.ok ? declarationResolution.declarationId : undefined
  const adapter = chrome.runtime.services?.consentLogging
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)
  const locale = chrome.runtime.locale

  const incoming = assessEligibilityDeclarationIncomingValue(
    formData,
    declarationId,
    chrome.instanceFieldId,
  )
  const malformedIncoming = incoming.kind === 'malformed'
  const stored = incoming.kind === 'present' ? incoming.value : undefined
  const checked = stored?.accepted === true

  const [uiState, setUiState] = useState<UiState>(() =>
    baseUiState(declarationResolution.ok, Boolean(adapter)),
  )
  const [showRecordedStatus, setShowRecordedStatus] = useState(() => incoming.kind === 'present')

  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const lastExternalRef = useRef(formData)
  const pendingDesiredRef = useRef<boolean | null>(null)
  const retryDesiredRef = useRef<boolean | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    pendingDesiredRef.current = null
    retryDesiredRef.current = null
    setUiState(baseUiState(declarationResolution.ok, Boolean(adapter)))
  }, [adapter, declarationId, declarationResolution.ok, chrome.instanceFieldId])

  useEffect(() => {
    // Locale change clears in-flight recording and obsolete failed Retry intent.
    if (pendingDesiredRef.current === null && retryDesiredRef.current === null) {
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    pendingDesiredRef.current = null
    retryDesiredRef.current = null
    setShowRecordedStatus(incoming.kind === 'present')
    setUiState(baseUiState(declarationResolution.ok, Boolean(adapter)))
  }, [locale, adapter, declarationResolution.ok, incoming.kind])

  useEffect(() => {
    if (formData === lastExternalRef.current) {
      return
    }
    lastExternalRef.current = formData
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    pendingDesiredRef.current = null
    retryDesiredRef.current = null
    setShowRecordedStatus(incoming.kind === 'present')
    setUiState(baseUiState(declarationResolution.ok, Boolean(adapter)))
  }, [formData, adapter, declarationResolution.ok, incoming.kind])

  useEffect(() => {
    if (!(isDisabled || isReadOnly) || uiState !== 'recording') {
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    pendingDesiredRef.current = null
    retryDesiredRef.current = null
    setShowRecordedStatus(incoming.kind === 'present')
    setUiState(baseUiState(declarationResolution.ok, Boolean(adapter)))
  }, [isDisabled, isReadOnly, uiState, adapter, declarationResolution.ok, incoming.kind])

  async function recordDecision(desiredAccepted: boolean) {
    if (
      !declarationResolution.ok ||
      !adapter ||
      isDisabled ||
      isReadOnly ||
      uiState === 'recording'
    ) {
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    const requestedDeclarationId = declarationResolution.declarationId
    const requestedLocale = locale
    pendingDesiredRef.current = desiredAccepted
    retryDesiredRef.current = null
    setShowRecordedStatus(false)
    setUiState('recording')

    try {
      const result = await adapter.recordDecision({
        fieldId: chrome.instanceFieldId,
        declarationId: requestedDeclarationId,
        accepted: desiredAccepted,
        locale: requestedLocale,
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      const acceptedValue = acceptConsentLoggingResult(result, {
        declarationId: requestedDeclarationId,
        accepted: desiredAccepted,
        locale: requestedLocale,
        fieldId: chrome.instanceFieldId,
      })
      if (!acceptedValue) {
        pendingDesiredRef.current = null
        retryDesiredRef.current = desiredAccepted
        setUiState('failed')
        return
      }
      const emitted = emitEligibilityDeclarationValue(acceptedValue, chrome.instanceFieldId)
      if (!emitted) {
        pendingDesiredRef.current = null
        retryDesiredRef.current = desiredAccepted
        setUiState('failed')
        return
      }
      pendingDesiredRef.current = null
      retryDesiredRef.current = null
      lastExternalRef.current = emitted
      onChange(emitted)
      setShowRecordedStatus(true)
      setUiState('idle')
    } catch {
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      pendingDesiredRef.current = null
      retryDesiredRef.current = desiredAccepted
      setUiState('failed')
    }
  }

  function handleCheckboxChange(event: ChangeEvent<HTMLInputElement>) {
    if (
      isDisabled ||
      isReadOnly ||
      uiState === 'recording' ||
      !adapter ||
      !declarationResolution.ok
    ) {
      return
    }
    void recordDecision(event.target.checked)
  }

  function handleRetry() {
    const desired = retryDesiredRef.current
    if (desired === null || isDisabled || isReadOnly) {
      return
    }
    void recordDecision(desired)
  }

  const checkboxId = `${id}__accept`
  const statusId = `${id}__declaration-status`
  const declarationTextId = chrome.helpId ?? `${id}__declaration-text`

  const politeStatus =
    uiState === 'recording'
      ? chrome.message('declarationRecording')
      : uiState === 'unavailable'
        ? chrome.message('declarationUnavailable')
        : showRecordedStatus && stored
          ? chrome.message('declarationRecorded')
          : ''

  const alertMessages = [
    ...chrome.errorMessages,
    ...(uiState === 'invalid-config' ? [chrome.message('declarationConfigInvalid')] : []),
    ...(malformedIncoming ? [chrome.message('declarationInvalidValue')] : []),
    ...(uiState === 'failed' ? [chrome.message('declarationFailed')] : []),
  ]
  const uniqueAlerts = [...new Set(alertMessages)]
  const hasError = uniqueAlerts.length > 0
  const errorId = hasError ? `${id}__error` : undefined
  const describedBy =
    [declarationTextId, politeStatus ? statusId : undefined, errorId].filter(Boolean).join(' ') ||
    undefined

  const canInteract =
    Boolean(adapter) &&
    declarationResolution.ok &&
    !isDisabled &&
    !isReadOnly &&
    uiState !== 'recording' &&
    uiState !== 'invalid-config' &&
    uiState !== 'unavailable'

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="eligibility-declaration"
      aria-describedby={describedBy}
      aria-invalid={hasError || undefined}
    >
      <legend className="dg20-label">
        <span>{chrome.label.text}</span>
      </legend>
      {chrome.help.text ? (
        <p className="dg20-help" id={declarationTextId}>
          {chrome.help.text}
        </p>
      ) : (
        <p className="dg20-help" id={declarationTextId}>
          {chrome.label.text}
        </p>
      )}

      <label className="dg20-radio-option" htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          className="dg20-radio"
          checked={checked}
          disabled={!canInteract}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          onChange={handleCheckboxChange}
        />
        <span>{chrome.message('declarationAcceptLabel')}</span>
      </label>

      {uiState === 'failed' && !isDisabled && !isReadOnly ? (
        <div className="dg20-action-row">
          <button type="button" className="dg20-button" onClick={handleRetry}>
            {chrome.message('retry')}
          </button>
        </div>
      ) : null}

      {politeStatus ? (
        <p className="dg20-status" id={statusId} role="status" aria-live="polite">
          {politeStatus}
        </p>
      ) : null}
      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {uniqueAlerts.join(' ')}
        </p>
      ) : null}
    </fieldset>
  )
}

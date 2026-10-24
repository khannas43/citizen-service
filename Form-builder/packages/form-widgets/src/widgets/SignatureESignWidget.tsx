import { useEffect, useRef, useState } from 'react'

import {
  acceptESignResult,
  assessSignatureESignIncomingValue,
  emitSignatureESignValue,
  resolveESignContextRevision,
  type SignatureESignValue,
} from '../runtime/signature-esign.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

export type { SignatureESignValue }

type UiState =
  | 'unsigned'
  | 'signing'
  | 'signed'
  | 'cancelled'
  | 'unavailable-adapter'
  | 'unavailable-context'
  | 'failed'

function baseUiState(
  adapterPresent: boolean,
  revisionOk: boolean,
  hasCurrent: boolean,
): Exclude<UiState, 'signing' | 'cancelled' | 'failed'> {
  // Persisted current signature wins over adapter availability (FB-A11.1).
  if (hasCurrent) {
    return 'signed'
  }
  if (!adapterPresent) {
    return 'unavailable-adapter'
  }
  if (!revisionOk) {
    return 'unavailable-context'
  }
  return 'unsigned'
}

/**
 * Host-injected eSign signature (provisional FB-A11).
 * Explicit Sign only — never auto on mount/locale/external load.
 * Persists reference-only SignatureESignValue; never bytes/base64/PDF/tokens.
 */
export function SignatureESignWidget(props: Dg20FieldProps) {
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

  const revisionResolution = resolveESignContextRevision(chrome.runtime.eSignContextRevision)
  const contextRevision = revisionResolution.ok ? revisionResolution.contextRevision : undefined
  const adapter = chrome.runtime.services?.eSign
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)
  const locale = chrome.runtime.locale
  const fieldId = chrome.instanceFieldId

  const incoming = assessSignatureESignIncomingValue(formData, contextRevision, fieldId)
  const malformedIncoming = incoming.kind === 'malformed'
  const currentValue = incoming.kind === 'current' ? incoming.value : undefined
  const isStale = incoming.kind === 'stale'

  const [uiState, setUiState] = useState<UiState>(() =>
    baseUiState(Boolean(adapter), revisionResolution.ok, incoming.kind === 'current'),
  )

  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const lastExternalRef = useRef(formData)
  const pendingRef = useRef(false)
  const retryIntentRef = useRef(false)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    pendingRef.current = false
    retryIntentRef.current = false
    setUiState(baseUiState(Boolean(adapter), revisionResolution.ok, incoming.kind === 'current'))
  }, [adapter, contextRevision, revisionResolution.ok, incoming.kind, fieldId])

  useEffect(() => {
    if (!pendingRef.current && !retryIntentRef.current) {
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    pendingRef.current = false
    retryIntentRef.current = false
    setUiState(baseUiState(Boolean(adapter), revisionResolution.ok, incoming.kind === 'current'))
  }, [locale, adapter, revisionResolution.ok, incoming.kind])

  useEffect(() => {
    if (formData === lastExternalRef.current) {
      return
    }
    lastExternalRef.current = formData
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    pendingRef.current = false
    retryIntentRef.current = false
    setUiState(baseUiState(Boolean(adapter), revisionResolution.ok, incoming.kind === 'current'))
  }, [formData, adapter, revisionResolution.ok, incoming.kind])

  useEffect(() => {
    if (!(isDisabled || isReadOnly) || uiState !== 'signing') {
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    pendingRef.current = false
    retryIntentRef.current = false
    setUiState(baseUiState(Boolean(adapter), revisionResolution.ok, incoming.kind === 'current'))
  }, [isDisabled, isReadOnly, uiState, adapter, revisionResolution.ok, incoming.kind])

  async function requestSignature() {
    if (
      !revisionResolution.ok ||
      !adapter ||
      isDisabled ||
      isReadOnly ||
      uiState === 'signing' ||
      pendingRef.current
    ) {
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    const requestedRevision = revisionResolution.contextRevision
    const requestedLocale = locale
    const requestedFieldId = fieldId
    pendingRef.current = true
    retryIntentRef.current = false
    setUiState('signing')

    try {
      const result = await adapter.requestSignature({
        fieldId: requestedFieldId,
        contextRevision: requestedRevision,
        locale: requestedLocale,
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      const accepted = acceptESignResult(result, {
        fieldId: requestedFieldId,
        contextRevision: requestedRevision,
      })
      if (!accepted) {
        pendingRef.current = false
        retryIntentRef.current = true
        setUiState('failed')
        return
      }
      if ('cancelled' in accepted) {
        pendingRef.current = false
        retryIntentRef.current = true
        setUiState('cancelled')
        return
      }
      const emitted = emitSignatureESignValue(accepted, requestedFieldId)
      if (!emitted) {
        pendingRef.current = false
        retryIntentRef.current = true
        setUiState('failed')
        return
      }
      pendingRef.current = false
      retryIntentRef.current = false
      lastExternalRef.current = emitted
      onChange(emitted)
      setUiState('signed')
    } catch {
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      pendingRef.current = false
      retryIntentRef.current = true
      setUiState('failed')
    }
  }

  function handleSign() {
    void requestSignature()
  }

  function handleRetry() {
    if (!retryIntentRef.current || isDisabled || isReadOnly) {
      return
    }
    void requestSignature()
  }

  const statusId = `${id}__esign-status`
  const labelId = `${id}__label`

  const retainedCurrent = currentValue !== undefined
  const showAsSigning = uiState === 'signing'
  const showAsSigned =
    retainedCurrent && uiState !== 'signing' && uiState !== 'cancelled' && uiState !== 'failed'

  const politeStatus = showAsSigning
    ? chrome.message('eSignSigning')
    : uiState === 'cancelled'
      ? retainedCurrent
        ? chrome.message('eSignCancelledRetained')
        : chrome.message('eSignCancelled')
      : uiState === 'failed'
        ? ''
        : uiState === 'unavailable-adapter'
          ? chrome.message('eSignUnavailable')
          : uiState === 'unavailable-context'
            ? chrome.message('eSignContextUnavailable')
            : showAsSigned
              ? chrome.message('eSignSigned')
              : isStale
                ? chrome.message('eSignStaleStatus')
                : chrome.message('eSignUnsigned')

  const alertMessages = [
    ...chrome.errorMessages,
    ...(malformedIncoming ? [chrome.message('eSignInvalidValue')] : []),
    ...(uiState === 'failed' && retainedCurrent
      ? [chrome.message('eSignFailedRetained')]
      : uiState === 'failed'
        ? [chrome.message('eSignFailed')]
        : []),
  ]
  const uniqueAlerts = [...new Set(alertMessages)]
  const hasError = uniqueAlerts.length > 0
  const errorId = hasError ? `${id}__error` : undefined
  const describedBy =
    [chrome.helpId, politeStatus ? statusId : undefined, errorId].filter(Boolean).join(' ') ||
    undefined

  const canSign =
    Boolean(adapter) && revisionResolution.ok && !isDisabled && !isReadOnly && uiState !== 'signing'

  const showRetry =
    (uiState === 'failed' || uiState === 'cancelled') &&
    !isDisabled &&
    !isReadOnly &&
    Boolean(adapter) &&
    revisionResolution.ok

  // Exactly one action: Retry wins over Replace/Sign after replacement fail/cancel.
  const showReplace = retainedCurrent && canSign && !showRetry
  const showPrimarySign = canSign && !retainedCurrent && !showRetry

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="signature-esign"
      aria-describedby={describedBy}
      aria-invalid={hasError || undefined}
    >
      <legend className="dg20-label" id={labelId}>
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

      <p
        className="dg20-status"
        id={statusId}
        role="status"
        aria-live="polite"
        data-dg20-esign-state={
          showAsSigning
            ? 'signing'
            : uiState === 'cancelled'
              ? 'cancelled'
              : uiState === 'failed'
                ? 'failed'
                : showAsSigned
                  ? 'signed'
                  : uiState === 'unavailable-adapter'
                    ? 'unavailable-adapter'
                    : uiState === 'unavailable-context'
                      ? 'unavailable-context'
                      : isStale
                        ? 'stale'
                        : 'unsigned'
        }
      >
        {politeStatus}
      </p>

      {showPrimarySign || showReplace || showRetry ? (
        <div className="dg20-action-row">
          {showPrimarySign ? (
            <button type="button" className="dg20-button" onClick={handleSign}>
              {chrome.message('eSignSignAction')}
            </button>
          ) : null}
          {showReplace ? (
            <button
              type="button"
              className="dg20-button dg20-button-secondary"
              onClick={handleSign}
            >
              {chrome.message('eSignReplaceAction')}
            </button>
          ) : null}
          {showRetry ? (
            <button type="button" className="dg20-button" onClick={handleRetry}>
              {chrome.message('retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {uniqueAlerts.join(' ')}
        </p>
      ) : null}
    </fieldset>
  )
}

import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20WidgetProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

type VerifyState = 'idle' | 'sending' | 'sent' | 'error' | 'unavailable'

function isPlausibleEmail(value: string): boolean {
  // Lightweight client gate only — JSON Schema format=email remains canonical.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * Email widget. Optional verification via EmailVerificationAdapter when
 * schema["x-dg20"].verifyEmail is true. Never stores verification status in form data.
 */
export function EmailWidget(props: Dg20WidgetProps) {
  const {
    id,
    name,
    value,
    required,
    disabled,
    readonly,
    autofocus,
    placeholder,
    onChange,
    onBlur,
    onFocus,
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
  const verifyEnabled = extensions.verifyEmail === true
  const adapter = chrome.runtime.services?.emailVerification
  const isDisabled = disabled || chrome.disabled
  const isReadOnly = readonly || chrome.readOnly
  const stringValue = typeof value === 'string' ? value : value == null ? '' : String(value)

  const [verifyState, setVerifyState] = useState<VerifyState>(() =>
    verifyEnabled && !adapter ? 'unavailable' : 'idle',
  )
  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const statusId = `${id}__verify-status`
  const verifyEnabledRef = useRef(verifyEnabled)
  const adapterRef = useRef(adapter)

  verifyEnabledRef.current = verifyEnabled
  adapterRef.current = adapter

  function resetVerifyState() {
    const enabled = verifyEnabledRef.current
    const hasAdapter = Boolean(adapterRef.current)
    setVerifyState(enabled && !hasAdapter ? 'unavailable' : 'idle')
  }

  function invalidateActiveRequest() {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    resetVerifyState()
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    setVerifyState(verifyEnabled && !adapter ? 'unavailable' : 'idle')
  }, [verifyEnabled, adapter, chrome.instanceFieldId])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    invalidateActiveRequest()
    onChange(next === '' ? undefined : next)
  }

  async function sendVerification() {
    if (!verifyEnabled || !adapter || isDisabled || isReadOnly) {
      return
    }
    if (!isPlausibleEmail(stringValue)) {
      return
    }
    if (verifyState === 'sending') {
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    const requestedEmail = stringValue.trim()
    setVerifyState('sending')

    try {
      await adapter.requestVerificationLink({
        fieldId: chrome.instanceFieldId,
        email: requestedEmail,
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      setVerifyState('sent')
    } catch {
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      setVerifyState('error')
    }
  }

  const statusText =
    verifyState === 'sending'
      ? chrome.message('verificationSending')
      : verifyState === 'sent'
        ? chrome.message('verificationLinkSent')
        : verifyState === 'error'
          ? chrome.message('operationFailed')
          : verifyState === 'unavailable'
            ? chrome.message('verificationUnavailable')
            : ''

  return (
    <div className="dg20-field" lang={chrome.lang}>
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
      <input
        id={id}
        name={name}
        type="email"
        autoComplete="email"
        inputMode="email"
        className="dg20-control"
        value={stringValue}
        required={required}
        disabled={isDisabled}
        readOnly={isReadOnly}
        autoFocus={autofocus}
        placeholder={placeholder}
        aria-invalid={chrome.hasError || undefined}
        aria-required={required || undefined}
        aria-describedby={
          [chrome.describedBy, statusText ? statusId : undefined].filter(Boolean).join(' ') ||
          undefined
        }
        onChange={handleChange}
        onBlur={onBlur && ((event) => onBlur(id, event.target.value || undefined))}
        onFocus={onFocus && ((event) => onFocus(id, event.target.value || undefined))}
      />
      {verifyEnabled ? (
        <div className="dg20-action-row">
          {verifyState === 'unavailable' ? (
            <p className="dg20-status" id={statusId} role="status">
              {chrome.message('verificationUnavailable')}
            </p>
          ) : (
            <>
              <button
                type="button"
                className="dg20-button"
                disabled={
                  isDisabled ||
                  isReadOnly ||
                  verifyState === 'sending' ||
                  !isPlausibleEmail(stringValue)
                }
                onClick={() => {
                  void sendVerification()
                }}
              >
                {chrome.message('sendVerificationLink')}
              </button>
              {statusText ? (
                <p className="dg20-status" id={statusId} role="status" aria-live="polite">
                  {statusText}
                  {verifyState === 'error' ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="dg20-button dg20-button-secondary"
                        onClick={() => {
                          void sendVerification()
                        }}
                      >
                        {chrome.message('retry')}
                      </button>
                    </>
                  ) : null}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {chrome.hasError ? (
        <p className="dg20-error" id={chrome.errorId} role="alert">
          {chrome.errorMessages.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

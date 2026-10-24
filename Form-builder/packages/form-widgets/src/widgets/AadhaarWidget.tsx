import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'

import {
  formatAadhaarMask,
  inferAadhaarIdentifierKind,
  isSafeIdentityTokenizationResult,
  isValidAadhaarOrVid,
  normalizeIdentityPaste,
} from '../runtime/aadhaar-identifier.js'
import type { AadhaarIdentifierKind } from '../runtime/service-ports.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/** Reference-only Aadhaar/VID value stored in form data. */
export interface AadhaarReferenceValue {
  readonly referenceToken: string
  readonly identifierKind: AadhaarIdentifierKind
  readonly lastFour: string
}

function asReferenceValue(value: unknown): AadhaarReferenceValue | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as {
    referenceToken?: unknown
    identifierKind?: unknown
    lastFour?: unknown
  }
  if (typeof record.referenceToken !== 'string' || record.referenceToken.trim().length === 0) {
    return undefined
  }
  if (record.identifierKind !== 'AADHAAR' && record.identifierKind !== 'VID') {
    return undefined
  }
  if (typeof record.lastFour !== 'string' || !/^[0-9]{4}$/.test(record.lastFour)) {
    return undefined
  }
  return {
    referenceToken: record.referenceToken,
    identifierKind: record.identifierKind,
    lastFour: record.lastFour,
  }
}

type TokenizeState = 'idle' | 'tokenizing' | 'error' | 'unavailable'

/**
 * Aadhaar / VID capture as reference token only.
 * Raw identifier exists only in the uncontrolled password input and adapter request.
 */
export function AadhaarWidget(props: Dg20FieldProps) {
  const { name, formData, required, disabled, readonly, onChange, schema, rawErrors, idSchema } =
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

  const stored = asReferenceValue(formData)
  const adapter = chrome.runtime.services?.identityTokenization
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)

  const [digitLength, setDigitLength] = useState(0)
  const [checksumOk, setChecksumOk] = useState(false)
  const [localInvalid, setLocalInvalid] = useState(false)
  const [tokenizeState, setTokenizeState] = useState<TokenizeState>(() =>
    !adapter ? 'unavailable' : 'idle',
  )

  const inputId = `${id}__raw`
  const statusId = `${id}__aadhaar-status`
  const maskId = `${id}__mask`

  function clearRawInput() {
    if (inputRef.current) {
      inputRef.current.value = ''
    }
    setDigitLength(0)
    setChecksumOk(false)
    setLocalInvalid(false)
  }

  function invalidateActiveRequest() {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    setTokenizeState(!adapter ? 'unavailable' : 'idle')
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
    setTokenizeState(!adapter ? 'unavailable' : 'idle')
  }, [adapter, chrome.instanceFieldId])

  function syncFromInput() {
    const raw = inputRef.current?.value ?? ''
    setDigitLength(raw.length)
    if (raw.length === 0) {
      setLocalInvalid(false)
      setChecksumOk(false)
      return
    }
    const kind = inferAadhaarIdentifierKind(raw)
    if (kind === undefined) {
      setLocalInvalid(raw.length >= 12)
      setChecksumOk(false)
      return
    }
    const ok = isValidAadhaarOrVid(raw)
    setLocalInvalid(!ok)
    setChecksumOk(ok)
  }

  function handleInput(event: FormEvent<HTMLInputElement>) {
    const el = event.currentTarget
    const normalized = normalizeIdentityPaste(el.value).slice(0, 16)
    if (el.value !== normalized) {
      el.value = normalized
    }
    invalidateActiveRequest()
    syncFromInput()
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const text = event.clipboardData.getData('text')
    const normalized = normalizeIdentityPaste(text).slice(0, 16)
    const el = inputRef.current
    if (!el) {
      return
    }
    el.value = normalized
    invalidateActiveRequest()
    syncFromInput()
  }

  function blockCopyCut(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
  }

  function handleClearStored() {
    if (isDisabled || isReadOnly) {
      return
    }
    invalidateActiveRequest()
    clearRawInput()
    onChange(undefined)
  }

  async function tokenize() {
    if (!adapter || isDisabled || isReadOnly || tokenizeState === 'tokenizing') {
      return
    }
    const raw = inputRef.current?.value ?? ''
    const kind = inferAadhaarIdentifierKind(raw)
    if (kind === undefined || !isValidAadhaarOrVid(raw)) {
      setLocalInvalid(true)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    setTokenizeState('tokenizing')
    setLocalInvalid(false)

    try {
      const result = await adapter.tokenizeIdentity({
        fieldId: chrome.instanceFieldId,
        identifierKind: kind,
        rawIdentifier: raw,
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      if (!isSafeIdentityTokenizationResult(raw, result)) {
        setTokenizeState('error')
        clearRawInput()
        return
      }
      onChange({
        referenceToken: result.referenceToken,
        identifierKind: kind,
        lastFour: result.lastFour,
      } satisfies AadhaarReferenceValue)
      setTokenizeState('idle')
      clearRawInput()
    } catch {
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      setTokenizeState('error')
      clearRawInput()
    }
  }

  const tokenizeEnabled =
    Boolean(adapter) && !isDisabled && !isReadOnly && tokenizeState !== 'tokenizing' && checksumOk

  const statusText =
    tokenizeState === 'tokenizing'
      ? chrome.message('aadhaarTokenizing')
      : tokenizeState === 'error'
        ? chrome.message('aadhaarTokenizationFailedReenter')
        : tokenizeState === 'unavailable' && !stored
          ? chrome.message('aadhaarTokenizationUnavailable')
          : ''

  const validationError = localInvalid ? chrome.message('aadhaarInvalidIdentifier') : ''
  const displayErrors = [
    ...(validationError ? [validationError] : []),
    ...chrome.errorMessages,
  ].filter((msg, index, arr) => arr.indexOf(msg) === index)
  const hasError = displayErrors.length > 0
  const errorId = hasError ? `${id}__error` : undefined

  if (stored) {
    const mask = formatAadhaarMask(stored.identifierKind, stored.lastFour)
    return (
      <fieldset
        className="dg20-field dg20-fieldset"
        lang={chrome.lang}
        disabled={isDisabled}
        data-dg20-widget="aadhaar"
        aria-describedby={
          [chrome.describedBy, maskId, statusId, errorId].filter(Boolean).join(' ') || undefined
        }
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
        <p className="dg20-mask" id={maskId} data-dg20-mask={stored.identifierKind}>
          <span className="dg20-help">{chrome.message('aadhaarMaskedLabel')}</span>
          <span className="dg20-mask-value">{mask}</span>
        </p>
        {!isReadOnly && !isDisabled ? (
          <div className="dg20-action-row">
            <button
              type="button"
              className="dg20-button dg20-button-secondary"
              onClick={handleClearStored}
            >
              {chrome.message('aadhaarReplace')}
            </button>
          </div>
        ) : null}
        {hasError ? (
          <p className="dg20-error" id={errorId} role="alert">
            {displayErrors.join(' ')}
          </p>
        ) : null}
      </fieldset>
    )
  }

  // Raw string formData must not be echoed — ignore non-reference values.
  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="aadhaar"
      aria-describedby={
        [chrome.describedBy, statusText ? statusId : undefined, errorId]
          .filter(Boolean)
          .join(' ') || undefined
      }
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

      {!isReadOnly ? (
        <>
          <input
            ref={inputRef}
            id={inputId}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="dg20-control"
            maxLength={16}
            disabled={isDisabled || tokenizeState === 'unavailable'}
            aria-label={chrome.label.text}
            aria-invalid={hasError || undefined}
            aria-required={required || undefined}
            data-dg20-digit-length={digitLength}
            onInput={handleInput}
            onPaste={handlePaste}
            onCopy={blockCopyCut}
            onCut={blockCopyCut}
          />
          <div className="dg20-action-row">
            {tokenizeState === 'unavailable' ? (
              <p className="dg20-status" id={statusId} role="status">
                {chrome.message('aadhaarTokenizationUnavailable')}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className="dg20-button"
                  disabled={!tokenizeEnabled}
                  onClick={() => {
                    void tokenize()
                  }}
                >
                  {chrome.message('aadhaarSecureTokenize')}
                </button>
                {statusText ? (
                  <p className="dg20-status" id={statusId} role="status" aria-live="polite">
                    {statusText}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : (
        <p className="dg20-help">{chrome.message('aadhaarMaskedLabel')}</p>
      )}

      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {displayErrors.join(' ')}
        </p>
      ) : null}
    </fieldset>
  )
}

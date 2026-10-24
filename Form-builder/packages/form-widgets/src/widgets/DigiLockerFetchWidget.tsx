import { useEffect, useRef, useState } from 'react'

import {
  acceptDigiLockerFetchResult,
  parseStoredDigiLockerValue,
  resolveDigiLockerDocumentTypeCode,
} from '../runtime/file-storage.js'
import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/** DigiLocker issued-document reference only — never tokens or identity payloads. */
export interface DigiLockerDocumentValue {
  readonly issuerSignedRef: string
  readonly documentTypeCode: string
}

type FetchState = 'idle' | 'fetching' | 'unavailable' | 'invalid-config' | 'failed'

function baseState(
  typeOk: boolean,
  adapterPresent: boolean,
): Extract<FetchState, 'idle' | 'unavailable' | 'invalid-config'> {
  if (!typeOk) {
    return 'invalid-config'
  }
  if (!adapterPresent) {
    return 'unavailable'
  }
  return 'idle'
}

/**
 * DigiLocker issued-document fetch via host DigiLockerAdapter.
 * No OAuth, popup, redirect, or DigiLocker HTTP inside this package.
 */
export function DigiLockerFetchWidget(props: Dg20FieldProps) {
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
  const typeResolution = resolveDigiLockerDocumentTypeCode(extensions.digiLockerDocumentTypeCode)
  const typeCode = typeResolution.ok ? typeResolution.code : undefined
  const stored = parseStoredDigiLockerValue(formData, typeCode)
  const adapter = chrome.runtime.services?.digiLocker
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const [fetchState, setFetchState] = useState<FetchState>(() =>
    baseState(typeResolution.ok, Boolean(adapter)),
  )

  const statusId = `${id}__digilocker-status`

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    setFetchState(baseState(typeResolution.ok, Boolean(adapter)))
  }, [adapter, typeCode, typeResolution.ok, chrome.instanceFieldId])

  async function handleFetch() {
    if (isDisabled || isReadOnly || !typeResolution.ok || !adapter) {
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    const requestedCode = typeResolution.code
    setFetchState('fetching')

    try {
      const result = await adapter.fetchIssuedDocument({
        fieldId: chrome.instanceFieldId,
        documentTypeCode: requestedCode,
        signal: controller.signal,
      })
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      const accepted = acceptDigiLockerFetchResult(result, requestedCode)
      if (!accepted) {
        setFetchState('failed')
        return
      }
      onChange({
        issuerSignedRef: accepted.issuerSignedRef,
        documentTypeCode: accepted.documentTypeCode,
      } satisfies DigiLockerDocumentValue)
      setFetchState('idle')
    } catch {
      if (seq !== requestSeq.current || controller.signal.aborted) {
        return
      }
      setFetchState('failed')
    }
  }

  function handleRemove() {
    if (isDisabled || isReadOnly) {
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1
    onChange(undefined)
    setFetchState(baseState(typeResolution.ok, Boolean(adapter)))
  }

  const statusText =
    fetchState === 'fetching'
      ? chrome.message('digiLockerFetching')
      : fetchState === 'unavailable'
        ? chrome.message('digiLockerUnavailable')
        : fetchState === 'invalid-config'
          ? chrome.message('digiLockerConfigInvalid')
          : fetchState === 'failed'
            ? chrome.message('operationFailed')
            : ''

  const displayErrors = [...chrome.errorMessages]
  const showConfigError = fetchState === 'invalid-config'
  const hasError = displayErrors.length > 0 || showConfigError
  const errorId = hasError ? `${id}__error` : undefined

  return (
    <div className="dg20-field" lang={chrome.lang} data-dg20-widget="digilocker-fetch">
      <div className="dg20-label">
        <span>{chrome.label.text}</span>
        {required ? (
          <span className="dg20-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </div>
      {chrome.help.text ? (
        <p className="dg20-help" id={chrome.helpId}>
          {chrome.help.text}
        </p>
      ) : null}

      {stored ? (
        <div className="dg20-help" data-dg20-digilocker-reference="">
          <p>{chrome.message('digiLockerFetchedLabel')}</p>
          {!isReadOnly && !isDisabled ? (
            <button
              type="button"
              className="dg20-button dg20-button-secondary"
              onClick={handleRemove}
            >
              {chrome.message('digiLockerReplaceRemove')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="dg20-action-row">
          {!isReadOnly && !isDisabled && typeResolution.ok && adapter ? (
            <button
              type="button"
              className="dg20-button"
              disabled={fetchState === 'fetching'}
              onClick={() => {
                void handleFetch()
              }}
            >
              {chrome.message('digiLockerFetchAction')}
            </button>
          ) : null}
        </div>
      )}

      {statusText ? (
        <p className="dg20-status" id={statusId} role="status" aria-live="polite">
          {statusText}
        </p>
      ) : null}
      {showConfigError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {chrome.message('digiLockerConfigInvalid')}
        </p>
      ) : null}
      {!showConfigError && displayErrors.length > 0 ? (
        <p className="dg20-error" id={errorId} role="alert">
          {displayErrors.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

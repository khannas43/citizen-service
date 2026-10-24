import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react'

import { tryNormalizeDigitRun } from '../runtime/aadhaar-identifier.js'
import { isSafePincodeLookupFound } from '../runtime/master-data.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/** PIN code value with optional geography enrichment codes. */
export interface PincodeValue {
  readonly pincode: string
  readonly cityCode?: string
  readonly districtCode?: string
}

/** Bilingual labels retained from a validated lookup (never stored in form data). */
interface PincodeBilingualLabels {
  readonly cityLabelEn: string
  readonly cityLabelGu: string
  readonly districtLabelEn: string
  readonly districtLabelGu: string
}

function asPincodeValue(value: unknown): PincodeValue | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as {
    pincode?: unknown
    cityCode?: unknown
    districtCode?: unknown
  }
  if (typeof record.pincode !== 'string') {
    return undefined
  }
  const next: {
    pincode: string
    cityCode?: string
    districtCode?: string
  } = { pincode: record.pincode }
  if (typeof record.cityCode === 'string' && record.cityCode.length > 0) {
    next.cityCode = record.cityCode
  }
  if (typeof record.districtCode === 'string' && record.districtCode.length > 0) {
    next.districtCode = record.districtCode
  }
  return next
}

function emitPincode(value: PincodeValue): PincodeValue | undefined {
  if (value.pincode.length === 0) {
    return undefined
  }
  return value
}

type LookupState = 'idle' | 'looking' | 'not-found' | 'error' | 'unavailable' | 'resolved'

/**
 * 6-digit PIN with optional city/district enrichment via host adapter.
 * Lookup is driven by adapter + pincode so external/CAF formData changes re-resolve.
 */
export function PincodeWidget(props: Dg20FieldProps) {
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

  const stored = asPincodeValue(formData)
  const pincode = stored?.pincode ?? ''
  const adapter = chrome.runtime.services?.pincodeLookup
  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)
  const locale = chrome.runtime.locale

  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const fieldIdRef = useRef(chrome.instanceFieldId)
  fieldIdRef.current = chrome.instanceFieldId

  const [lookupState, setLookupState] = useState<LookupState>(() =>
    !adapter ? 'unavailable' : 'idle',
  )
  const [localInvalid, setLocalInvalid] = useState(false)
  const [bilingualLabels, setBilingualLabels] = useState<PincodeBilingualLabels | null>(null)

  const inputId = `${id}__pin`
  const statusId = `${id}__pin-status`

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestSeq.current += 1

    if (!adapter) {
      setLookupState('unavailable')
      setBilingualLabels(null)
      return
    }

    if (!/^[0-9]{6}$/.test(pincode)) {
      setLookupState('idle')
      setBilingualLabels(null)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    const digits = pincode
    setLookupState('looking')
    setBilingualLabels(null)

    void (async () => {
      try {
        const result = await adapter.lookupPincode({
          fieldId: fieldIdRef.current,
          pincode: digits,
          signal: controller.signal,
        })
        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }
        if (!result.found) {
          onChangeRef.current(emitPincode({ pincode: digits }))
          setLookupState('not-found')
          return
        }
        if (!isSafePincodeLookupFound(result)) {
          onChangeRef.current(emitPincode({ pincode: digits }))
          setLookupState('error')
          return
        }
        // Same pincode string → effect does not re-run; enrichment cannot loop.
        onChangeRef.current(
          emitPincode({
            pincode: digits,
            cityCode: result.cityCode,
            districtCode: result.districtCode,
          }),
        )
        setBilingualLabels({
          cityLabelEn: result.cityLabelEn,
          cityLabelGu: result.cityLabelGu,
          districtLabelEn: result.districtLabelEn,
          districtLabelGu: result.districtLabelGu,
        })
        setLookupState('resolved')
      } catch {
        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }
        onChangeRef.current(emitPincode({ pincode: digits }))
        setLookupState('error')
      }
    })()
  }, [adapter, pincode, chrome.instanceFieldId])

  function applyDigits(digits: string) {
    setLocalInvalid(false)

    if (digits.length === 0) {
      abortRef.current?.abort()
      abortRef.current = null
      requestSeq.current += 1
      setBilingualLabels(null)
      setLookupState(adapter ? 'idle' : 'unavailable')
      onChange(undefined)
      return
    }

    // Emit PIN only; six-digit values trigger lookup via the adapter+pincode effect.
    onChange(emitPincode({ pincode: digits }))
    if (digits.length < 6) {
      abortRef.current?.abort()
      abortRef.current = null
      requestSeq.current += 1
      setBilingualLabels(null)
      setLookupState(adapter ? 'idle' : 'unavailable')
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (isDisabled || isReadOnly) {
      return
    }
    const normalized = tryNormalizeDigitRun(event.target.value, 6)
    if (!normalized.ok) {
      setLocalInvalid(true)
      return
    }
    applyDigits(normalized.digits)
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    if (isDisabled || isReadOnly) {
      return
    }
    const normalized = tryNormalizeDigitRun(event.clipboardData.getData('text'), 6)
    if (!normalized.ok) {
      setLocalInvalid(true)
      return
    }
    applyDigits(normalized.digits)
  }

  const statusText =
    lookupState === 'looking'
      ? chrome.message('pincodeLookingUp')
      : lookupState === 'not-found'
        ? chrome.message('pincodeNotFound')
        : lookupState === 'error'
          ? chrome.message('operationFailed')
          : lookupState === 'unavailable'
            ? chrome.message('pincodeEnrichmentUnavailable')
            : ''

  const validationError = localInvalid ? chrome.message('pincodeInvalid') : ''
  const displayErrors = [
    ...(validationError ? [validationError] : []),
    ...chrome.errorMessages,
  ].filter((msg, index, arr) => arr.indexOf(msg) === index)
  const hasError = displayErrors.length > 0
  const errorId = hasError ? `${id}__error` : undefined

  const cityLabel =
    bilingualLabels === null
      ? null
      : locale === 'gu'
        ? bilingualLabels.cityLabelGu
        : bilingualLabels.cityLabelEn
  const districtLabel =
    bilingualLabels === null
      ? null
      : locale === 'gu'
        ? bilingualLabels.districtLabelGu
        : bilingualLabels.districtLabelEn

  return (
    <div className="dg20-field" lang={chrome.lang} data-dg20-widget="pincode">
      <label className="dg20-label" htmlFor={inputId}>
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
        id={inputId}
        name={`${name}.pincode`}
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        className="dg20-control"
        value={pincode}
        maxLength={6}
        required={Boolean(required)}
        disabled={isDisabled}
        readOnly={isReadOnly}
        aria-invalid={hasError || undefined}
        aria-describedby={
          [chrome.describedBy, statusText ? statusId : undefined, errorId]
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={handleChange}
        onPaste={handlePaste}
      />
      {statusText ? (
        <p className="dg20-status" id={statusId} role="status" aria-live="polite">
          {statusText}
        </p>
      ) : null}
      {cityLabel && districtLabel ? (
        <div className="dg20-help" data-dg20-pincode-enrichment="">
          <p>
            {chrome.message('pincodeCity')}: {cityLabel}
          </p>
          <p>
            {chrome.message('pincodeDistrict')}: {districtLabel}
          </p>
        </div>
      ) : null}
      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {displayErrors.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import type { PrefillBinding } from '@citizen/form-contract'

import {
  acceptCafPrefillResult,
  resolvePrefillBindingForField,
} from '../runtime/prefill-bindings.js'
import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

export type CafPrefillSource = 'CAF' | 'OVERRIDE'

/** CAF / Golden Record prefill value stored in form data. */
export interface CafPrefillValue {
  readonly value: string
  readonly source: CafPrefillSource
}

function asCafValue(value: unknown): CafPrefillValue | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as { value?: unknown; source?: unknown }
  if (typeof record.value !== 'string') {
    return undefined
  }
  if (record.source !== 'CAF' && record.source !== 'OVERRIDE') {
    return undefined
  }
  return { value: record.value, source: record.source }
}

type LoadState = 'idle' | 'loading' | 'unavailable' | 'manual' | 'invalid-binding'

function bindingFingerprint(resolution: ReturnType<typeof resolvePrefillBindingForField>): string {
  if (resolution.status === 'ok') {
    return `ok:${resolution.binding.cafAttribute}:${resolution.binding.confidenceMin}`
  }
  return resolution.status
}

/**
 * CAF prefill field. Bindings come from FormDefinition.meta.prefillBindings only.
 * Resolution is lazy and field-owned (FB-B5): the session coordinator may cache
 * settled host results, but this widget remains the only emitter of field values.
 */
export function CafPrefillWidget(props: Dg20FieldProps) {
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

  const stored = asCafValue(formData)
  const adapter = chrome.runtime.services?.cafPrefill
  const bindings = chrome.runtime.prefillBindings
  const bindingResolution = resolvePrefillBindingForField(bindings, chrome.definitionFieldId)
  const fingerprint = bindingFingerprint(bindingResolution)
  const activeBinding = bindingResolution.status === 'ok' ? bindingResolution.binding : undefined

  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)

  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const skipPrefillRef = useRef(false)
  const lastFingerprintRef = useRef(fingerprint)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [editing, setEditing] = useState(false)

  const inputId = `${id}__caf`
  const statusId = `${id}__caf-status`

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const fingerprintChanged = lastFingerprintRef.current !== fingerprint
    lastFingerprintRef.current = fingerprint

    if (fingerprintChanged) {
      skipPrefillRef.current = false
      setEditing(false)
    }

    abortRef.current?.abort()
    abortRef.current = null

    if (bindingResolution.status === 'invalid') {
      requestSeq.current += 1
      setLoadState('invalid-binding')
      return
    }
    if (bindingResolution.status === 'none') {
      requestSeq.current += 1
      setLoadState('manual')
      return
    }
    if (!adapter) {
      requestSeq.current += 1
      setLoadState('unavailable')
      return
    }

    if (skipPrefillRef.current || editing) {
      requestSeq.current += 1
      setLoadState('idle')
      return
    }

    const existing = asCafValue(formData)
    if (existing?.source === 'OVERRIDE') {
      skipPrefillRef.current = true
      requestSeq.current += 1
      setLoadState('idle')
      return
    }
    if (existing?.source === 'CAF' && !fingerprintChanged) {
      requestSeq.current += 1
      setLoadState('idle')
      return
    }

    if (!activeBinding) {
      requestSeq.current += 1
      setLoadState('manual')
      return
    }

    const binding: PrefillBinding = activeBinding
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++requestSeq.current
    // Safe loading UI may appear before the live StrictMode invocation.
    setLoadState('loading')

    void (async () => {
      // Defer one microtask so StrictMode setup→cleanup→setup cancels the first invoke.
      await Promise.resolve()
      if (seq !== requestSeq.current || controller.signal.aborted || skipPrefillRef.current) {
        return
      }
      try {
        const result = await adapter.resolvePrefill({
          fieldId: chrome.instanceFieldId,
          cafAttribute: binding.cafAttribute,
          signal: controller.signal,
        })
        if (seq !== requestSeq.current || controller.signal.aborted || skipPrefillRef.current) {
          return
        }
        if ('found' in result && result.found === false) {
          setLoadState('manual')
          return
        }
        const accepted = acceptCafPrefillResult(result, binding.confidenceMin)
        if (!accepted) {
          setLoadState('manual')
          return
        }
        onChangeRef.current({ value: accepted.value, source: 'CAF' } satisfies CafPrefillValue)
        setEditing(false)
        setLoadState('idle')
      } catch {
        if (seq !== requestSeq.current || controller.signal.aborted || skipPrefillRef.current) {
          return
        }
        setLoadState('unavailable')
      }
    })()

    return () => {
      controller.abort()
      if (requestSeq.current === seq) {
        requestSeq.current += 1
      }
    }
  }, [
    adapter,
    fingerprint,
    chrome.instanceFieldId,
    chrome.definitionFieldId,
    formData,
    editing,
    bindingResolution.status,
    activeBinding,
  ])

  const cafLocked = stored?.source === 'CAF' && !editing && !isReadOnly
  const stringValue = stored?.value ?? ''

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (isDisabled || isReadOnly || cafLocked || loadState === 'invalid-binding') {
      return
    }
    skipPrefillRef.current = true
    const next = event.target.value
    if (next.length === 0) {
      onChange(undefined)
      return
    }
    onChange({ value: next, source: 'OVERRIDE' } satisfies CafPrefillValue)
  }

  function startEdit() {
    if (isDisabled || isReadOnly || !stored || stored.source !== 'CAF') {
      return
    }
    skipPrefillRef.current = true
    setEditing(true)
    onChange({ value: stored.value, source: 'OVERRIDE' } satisfies CafPrefillValue)
  }

  const statusText =
    loadState === 'loading'
      ? chrome.message('cafPrefillLoading')
      : loadState === 'unavailable'
        ? chrome.message('cafPrefillUnavailable')
        : loadState === 'invalid-binding'
          ? chrome.message('cafPrefillBindingInvalid')
          : loadState === 'manual' && !stored
            ? chrome.message('cafPrefillManualHint')
            : stored?.source === 'CAF' && !editing
              ? chrome.message('cafPrefillIndicator')
              : ''

  const displayErrors = [...chrome.errorMessages]
  const showBindingError = loadState === 'invalid-binding'
  const hasError = displayErrors.length > 0 || showBindingError
  const errorId = hasError ? `${id}__error` : undefined

  return (
    <div
      className="dg20-field"
      lang={chrome.lang}
      data-dg20-widget="caf-prefill"
      data-dg20-caf-source={stored?.source}
    >
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
        name={name}
        type="text"
        className="dg20-control"
        value={stringValue}
        required={Boolean(required)}
        disabled={isDisabled || loadState === 'loading' || loadState === 'invalid-binding'}
        readOnly={isReadOnly || cafLocked}
        aria-invalid={hasError || undefined}
        aria-describedby={
          [chrome.describedBy, statusText ? statusId : undefined, errorId]
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={handleChange}
      />
      <div className="dg20-action-row">
        {stored?.source === 'CAF' && !editing && !isReadOnly && !isDisabled ? (
          <button type="button" className="dg20-button dg20-button-secondary" onClick={startEdit}>
            {chrome.message('cafPrefillEdit')}
          </button>
        ) : null}
        {statusText ? (
          <p className="dg20-status" id={statusId} role="status" aria-live="polite">
            {statusText}
          </p>
        ) : null}
      </div>
      {showBindingError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {chrome.message('cafPrefillBindingInvalid')}
        </p>
      ) : null}
      {!showBindingError && displayErrors.length > 0 ? (
        <p className="dg20-error" id={errorId} role="alert">
          {displayErrors.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

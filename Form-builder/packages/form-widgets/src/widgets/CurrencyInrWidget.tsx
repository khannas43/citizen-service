import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import type { Dg20WidgetProps } from '../runtime/widget-helpers.js'
import {
  formatCurrencyDisplay,
  parseDecimalInput,
  schemaNumber,
  useFieldChrome,
} from '../runtime/widget-helpers.js'

/**
 * INR currency amount. Visual ₹ prefix + accessible "Indian Rupee" context.
 * Propagates number | undefined; enforces non-negative via min=0 (schema may raise).
 */
export function CurrencyInrWidget(props: Dg20WidgetProps) {
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

  const schemaMin = schemaNumber(schema, 'minimum')
  const minimum = schemaMin === undefined ? 0 : Math.max(0, schemaMin)
  const maximum = schemaNumber(schema, 'maximum')
  const isDisabled = disabled || chrome.disabled
  const isReadOnly = readonly || chrome.readOnly

  const [text, setText] = useState(() => formatCurrencyDisplay(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) {
      setText(formatCurrencyDisplay(value))
    }
  }, [value])

  const currencyHintId = `${id}__currency`
  const describedBy = [chrome.describedBy, currencyHintId].filter(Boolean).join(' ') || undefined

  function emitFromText(raw: string) {
    const parsed = parseDecimalInput(raw)
    if (parsed === undefined) {
      onChange(undefined)
      return
    }
    // Round to 2 dp using integer maths to avoid float corruption in display path
    const cents = Math.round(parsed * 100)
    onChange(cents / 100)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    let raw = event.target.value.replace(/[^\d.]/g, '')
    const firstDot = raw.indexOf('.')
    if (firstDot !== -1) {
      raw =
        raw.slice(0, firstDot + 1) +
        raw
          .slice(firstDot + 1)
          .replace(/\./g, '')
          .slice(0, 2)
    }
    setText(raw)
    if (raw === '' || raw === '.') {
      onChange(undefined)
      return
    }
    emitFromText(raw)
  }

  function handleBlur(event: ChangeEvent<HTMLInputElement>) {
    const parsed = parseDecimalInput(event.target.value)
    if (parsed === undefined) {
      setText('')
      onChange(undefined)
      onBlur?.(id, undefined)
      return
    }
    const cents = Math.round(parsed * 100)
    const normalized = cents / 100
    setText(normalized.toFixed(2))
    onChange(normalized)
    onBlur?.(id, normalized)
  }

  const currencyLabel = chrome.message('amountInInr')

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
      <span className="dg20-visually-hidden" id={currencyHintId}>
        {currencyLabel}
      </span>
      <div className="dg20-affix-group">
        <span className="dg20-affix dg20-affix-prefix" aria-hidden="true">
          ₹
        </span>
        <input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          className="dg20-control"
          value={text}
          required={required}
          disabled={isDisabled}
          readOnly={isReadOnly}
          autoFocus={autofocus}
          placeholder={placeholder ?? '0.00'}
          min={minimum}
          max={maximum}
          aria-invalid={chrome.hasError || undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          onChange={handleChange}
          onBlur={(event) => {
            focusedRef.current = false
            handleBlur(event)
          }}
          onFocus={() => {
            focusedRef.current = true
            onFocus?.(id, typeof value === 'number' ? value : undefined)
          }}
        />
      </div>
      {chrome.hasError ? (
        <p className="dg20-error" id={chrome.errorId} role="alert">
          {chrome.errorMessages.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

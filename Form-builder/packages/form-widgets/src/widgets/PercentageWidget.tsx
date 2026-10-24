import type { ChangeEvent } from 'react'

import type { Dg20WidgetProps } from '../runtime/widget-helpers.js'
import { schemaNumber, useFieldChrome } from '../runtime/widget-helpers.js'

/**
 * Percentage 0–100 with visible % suffix and accessible percentage context.
 */
export function PercentageWidget(props: Dg20WidgetProps) {
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
  const schemaMax = schemaNumber(schema, 'maximum')
  const minimum = schemaMin === undefined ? 0 : Math.max(0, schemaMin)
  const maximum = schemaMax === undefined ? 100 : Math.min(100, schemaMax)
  const step = schemaNumber(schema, 'multipleOf') ?? 1
  const isDisabled = disabled || chrome.disabled
  const isReadOnly = readonly || chrome.readOnly

  const displayValue =
    typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value) ? String(value) : ''

  const percentHintId = `${id}__percent`
  const describedBy = [chrome.describedBy, percentHintId].filter(Boolean).join(' ') || undefined

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    if (raw.trim() === '') {
      onChange(undefined)
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      return
    }
    onChange(parsed)
  }

  const percentLabel = chrome.message('percentage')

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
      <span className="dg20-visually-hidden" id={percentHintId}>
        {percentLabel}
      </span>
      <div className="dg20-affix-group">
        <input
          id={id}
          name={name}
          type="number"
          className="dg20-control"
          value={displayValue}
          required={required}
          disabled={isDisabled}
          readOnly={isReadOnly}
          autoFocus={autofocus}
          placeholder={placeholder}
          min={minimum}
          max={maximum}
          step={step}
          inputMode="decimal"
          aria-invalid={chrome.hasError || undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          onChange={handleChange}
          onBlur={
            onBlur &&
            ((event) => {
              const raw = event.target.value
              if (raw.trim() === '') {
                onBlur(id, undefined)
                return
              }
              const parsed = Number(raw)
              onBlur(id, Number.isFinite(parsed) && !Number.isNaN(parsed) ? parsed : undefined)
            })
          }
          onFocus={
            onFocus &&
            ((event) => {
              const raw = event.target.value
              if (raw.trim() === '') {
                onFocus(id, undefined)
                return
              }
              const parsed = Number(raw)
              onFocus(id, Number.isFinite(parsed) && !Number.isNaN(parsed) ? parsed : undefined)
            })
          }
        />
        <span className="dg20-affix dg20-affix-suffix" aria-hidden="true">
          %
        </span>
      </div>
      {chrome.hasError ? (
        <p className="dg20-error" id={chrome.errorId} role="alert">
          {chrome.errorMessages.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

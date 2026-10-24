import type { ChangeEvent } from 'react'

import type { Dg20WidgetProps } from '../runtime/widget-helpers.js'
import { schemaMaxLength, useFieldChrome } from '../runtime/widget-helpers.js'

/**
 * Long text (textarea) with an optional remaining-character counter.
 * Counter is visual only — not a live region — to avoid noisy announcements.
 */
export function TextLongWidget(props: Dg20WidgetProps) {
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

  const maxLength = schemaMaxLength(schema)
  const isDisabled = disabled || chrome.disabled
  const isReadOnly = readonly || chrome.readOnly
  const stringValue = typeof value === 'string' ? value : value == null ? '' : String(value)
  const remaining =
    typeof maxLength === 'number' ? Math.max(0, maxLength - stringValue.length) : undefined
  const counterId = typeof maxLength === 'number' ? `${id}__counter` : undefined
  const describedBy = [chrome.describedBy, counterId].filter(Boolean).join(' ') || undefined

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value
    onChange(next === '' ? undefined : next)
  }

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
      <textarea
        id={id}
        name={name}
        className="dg20-textarea"
        value={stringValue}
        required={required}
        disabled={isDisabled}
        readOnly={isReadOnly}
        autoFocus={autofocus}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={chrome.hasError || undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        onChange={handleChange}
        onBlur={onBlur && ((event) => onBlur(id, event.target.value))}
        onFocus={onFocus && ((event) => onFocus(id, event.target.value))}
      />
      {typeof remaining === 'number' && counterId ? (
        <p className="dg20-char-counter" id={counterId}>
          {chrome.message('charactersRemaining', { count: remaining })}
        </p>
      ) : null}
      {chrome.hasError ? (
        <p className="dg20-error" id={chrome.errorId} role="alert">
          {chrome.errorMessages.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

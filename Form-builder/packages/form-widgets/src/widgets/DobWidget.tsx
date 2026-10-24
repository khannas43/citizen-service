import {
  compareCivil,
  completedAgeYears,
  earliestDobForMaxAge,
  formatIsoDate,
  isAgeWithinGate,
  latestDobForMinAge,
  parseIsoDate,
} from '../runtime/civil-date.js'
import { createBrowserWidgetClock } from '../runtime/service-ports.js'
import { parseDg20Extensions } from '../runtime/x-dg20.js'
import type { Dg20WidgetProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'
import type { ChangeEvent } from 'react'

function dedupeMessages(messages: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const message of messages) {
    if (seen.has(message)) {
      continue
    }
    seen.add(message)
    out.push(message)
  }
  return out
}

/**
 * Date of birth as YYYY-MM-DD string. Age gates via x-dg20 minAge/maxAge.
 * Never stores or emits JavaScript Date.
 */
export function DobWidget(props: Dg20WidgetProps) {
  const {
    id,
    name,
    value,
    required,
    disabled,
    readonly,
    autofocus,
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
  const minAge = extensions.minAge
  const maxAge = extensions.maxAge
  const configInvalid = minAge !== undefined && maxAge !== undefined && minAge > maxAge

  const clock = chrome.runtime.services?.clock ?? createBrowserWidgetClock()
  const today = parseIsoDate(clock.todayIso())

  const isDisabled = disabled || chrome.disabled
  const isReadOnly = readonly || chrome.readOnly
  const stringValue = typeof value === 'string' ? value : ''

  const dob = stringValue ? parseIsoDate(stringValue) : undefined
  const isFuture = Boolean(dob && today && compareCivil(dob, today) > 0)
  const age =
    dob && today && !configInvalid && !isFuture ? completedAgeYears(dob, today) : undefined
  const ageGateBroken = Boolean(
    dob && today && !configInvalid && !isFuture && !isAgeWithinGate(dob, today, minAge, maxAge),
  )

  let minAttr: string | undefined
  let maxAttr: string | undefined
  if (today && !configInvalid) {
    maxAttr =
      minAge !== undefined ? formatIsoDate(latestDobForMinAge(today, minAge)) : formatIsoDate(today)
    if (maxAge !== undefined) {
      minAttr = formatIsoDate(earliestDobForMaxAge(today, maxAge))
    }
  }

  const displayErrors = dedupeMessages([
    ...(configInvalid ? [chrome.message('ageConfigInvalid')] : []),
    ...(isFuture ? [chrome.message('futureDob')] : []),
    ...(ageGateBroken ? [chrome.message('ageGateViolation')] : []),
    ...chrome.errorMessages,
  ])
  const hasError = displayErrors.length > 0
  const errorId = hasError ? `${id}__error` : undefined
  const ageId = age !== undefined ? `${id}__age` : undefined
  const describedBy = [chrome.helpId, ageId, errorId].filter(Boolean).join(' ') || undefined

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    if (next === '') {
      onChange(undefined)
      return
    }
    const parsed = parseIsoDate(next)
    if (!parsed) {
      return
    }
    onChange(formatIsoDate(parsed))
  }

  return (
    <div className="dg20-field" lang={chrome.lang} data-dg20-widget="dob">
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
        type="date"
        className="dg20-control"
        value={stringValue}
        required={required}
        disabled={isDisabled || configInvalid}
        readOnly={isReadOnly}
        autoFocus={autofocus}
        min={minAttr}
        max={maxAttr}
        aria-invalid={hasError || undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        onChange={handleChange}
        onBlur={onBlur && ((event) => onBlur(id, event.target.value || undefined))}
        onFocus={onFocus && ((event) => onFocus(id, event.target.value || undefined))}
      />
      {age !== undefined ? (
        <p className="dg20-help" id={ageId}>
          {chrome.message('derivedAge', { age })}
        </p>
      ) : null}
      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {displayErrors.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

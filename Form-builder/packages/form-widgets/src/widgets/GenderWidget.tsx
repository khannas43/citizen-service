import type { Dg20WidgetProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/** Governed gender codes (design-spec v1 baseline). */
export const GENDER_CODES = ['M', 'F', 'OTHER'] as const

export type GenderCode = (typeof GENDER_CODES)[number]

export function isGenderCode(value: unknown): value is GenderCode {
  return value === 'M' || value === 'F' || value === 'OTHER'
}

/**
 * Fixed gender radio group. Ignores arbitrary JSON Schema enum options.
 * Emits governed codes M | F | OTHER, never translated labels.
 */
export function GenderWidget(props: Dg20WidgetProps) {
  const {
    id,
    name,
    value,
    required,
    disabled,
    readonly,
    onChange,
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

  const isDisabled = disabled || chrome.disabled
  const isReadOnly = readonly || chrome.readOnly
  const selected = isGenderCode(value) ? value : undefined

  const options: { code: GenderCode; messageKey: 'genderMale' | 'genderFemale' | 'genderOther' }[] =
    [
      { code: 'M', messageKey: 'genderMale' },
      { code: 'F', messageKey: 'genderFemale' },
      { code: 'OTHER', messageKey: 'genderOther' },
    ]

  function select(code: GenderCode) {
    if (isDisabled || isReadOnly) {
      return
    }
    onChange(code)
  }

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="gender"
      aria-describedby={chrome.describedBy}
      aria-invalid={chrome.hasError || undefined}
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
      <div className="dg20-radio-group" role="presentation">
        {options.map((option) => {
          const optionId = `${id}__${option.code}`
          return (
            <label key={option.code} className="dg20-radio-option" htmlFor={optionId}>
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.code}
                className="dg20-radio"
                checked={selected === option.code}
                disabled={isDisabled}
                required={required && selected === undefined}
                onChange={(event) => {
                  if (isReadOnly) {
                    event.preventDefault()
                    return
                  }
                  select(option.code)
                }}
              />
              <span>{chrome.message(option.messageKey)}</span>
            </label>
          )
        })}
      </div>
      {chrome.hasError ? (
        <p className="dg20-error" id={chrome.errorId} role="alert">
          {chrome.errorMessages.join(' ')}
        </p>
      ) : null}
    </fieldset>
  )
}

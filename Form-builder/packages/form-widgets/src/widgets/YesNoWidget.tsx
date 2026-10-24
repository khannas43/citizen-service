import type { Dg20WidgetProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

export function isYesNoBoolean(value: unknown): value is boolean {
  return value === true || value === false
}

/**
 * Fixed Yes/No boolean radio group. Emits true | false | undefined only.
 * Ignores arbitrary schema enum labels/values.
 */
export function YesNoWidget(props: Dg20WidgetProps) {
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

  const isDisabled = Boolean(disabled || chrome.disabled)
  const isReadOnly = Boolean(readonly || chrome.readOnly)
  const selected = isYesNoBoolean(value) ? value : undefined
  const invalidIncoming = value !== undefined && value !== null && selected === undefined

  const displayErrors = [
    ...chrome.errorMessages,
    ...(invalidIncoming ? [chrome.message('yesNoInvalidValue')] : []),
  ]
  const hasError = displayErrors.length > 0
  const errorId = hasError ? `${id}__error` : undefined
  const describedBy = [chrome.helpId, errorId].filter(Boolean).join(' ') || undefined

  const choices: { readonly choice: boolean; readonly messageKey: 'yesNoYes' | 'yesNoNo' }[] = [
    { choice: true, messageKey: 'yesNoYes' },
    { choice: false, messageKey: 'yesNoNo' },
  ]

  function select(choice: boolean) {
    if (isDisabled || isReadOnly) {
      return
    }
    onChange(choice)
  }

  return (
    <fieldset
      className="dg20-field dg20-fieldset"
      lang={chrome.lang}
      disabled={isDisabled}
      data-dg20-widget="yesno"
      aria-describedby={describedBy}
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
      <div className="dg20-radio-group" role="presentation">
        {choices.map((option) => {
          const optionId = `${id}__${option.choice ? 'yes' : 'no'}`
          return (
            <label key={option.messageKey} className="dg20-radio-option" htmlFor={optionId}>
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.choice ? 'true' : 'false'}
                className="dg20-radio"
                checked={selected === option.choice}
                disabled={isDisabled || isReadOnly}
                required={required && selected === undefined}
                onChange={(event) => {
                  if (isReadOnly) {
                    event.preventDefault()
                    return
                  }
                  select(option.choice)
                }}
              />
              <span>{chrome.message(option.messageKey)}</span>
            </label>
          )
        })}
      </div>
      {hasError ? (
        <p className="dg20-error" id={errorId} role="alert">
          {displayErrors.join(' ')}
        </p>
      ) : null}
    </fieldset>
  )
}

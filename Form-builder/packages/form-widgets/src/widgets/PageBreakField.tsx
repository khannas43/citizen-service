import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/**
 * Progressive-profiling step boundary marker for Builder presentation.
 * Non-interactive — does not implement multi-step navigation.
 * Label from bilingual.labels[fieldId].
 */
export function PageBreakField(props: Dg20FieldProps) {
  const { name, schema, idSchema, required, rawErrors } = props
  const chrome = useFieldChrome({
    idSchema,
    name,
    label: schema.title,
    required,
    rawErrors,
    schema,
  })

  const stepLabel = chrome.label.text || chrome.message('stepBoundaryFallback')

  return (
    <div
      className="dg20-page-break"
      lang={chrome.lang}
      role="separator"
      aria-label={stepLabel}
      data-dg20-widget="page-break"
      id={idSchema.$id}
    >
      <span className="dg20-page-break-label">{stepLabel}</span>
    </div>
  )
}

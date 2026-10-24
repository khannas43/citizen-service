import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/**
 * Presentation-only section header. Produces no form data.
 * Fixed semantic heading level h2 (v1 — no ui:options headingLevel).
 */
export function SectionHeaderField(props: Dg20FieldProps) {
  const { name, schema, idSchema, required, rawErrors } = props
  const chrome = useFieldChrome({
    idSchema,
    name,
    label: schema.title,
    required,
    rawErrors,
    schema,
  })

  return (
    <h2
      className="dg20-section-header"
      lang={chrome.lang}
      id={idSchema.$id}
      data-dg20-widget="section-header"
    >
      {chrome.label.text}
    </h2>
  )
}

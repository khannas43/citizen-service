import type { Dg20FieldProps } from '../runtime/widget-helpers.js'
import { useFieldChrome } from '../runtime/widget-helpers.js'

/**
 * Presentation-only informational region. Produces no form data.
 * Body text from bilingual.help[fieldId]; schema.description is draft fallback only.
 */
export function InfoPanelField(props: Dg20FieldProps) {
  const { name, schema, idSchema, required, rawErrors } = props
  const chrome = useFieldChrome({
    idSchema,
    name,
    label: schema.title,
    required,
    rawErrors,
    schema,
  })

  const titleId = `${idSchema.$id}__title`
  const regionLabel = chrome.label.text || chrome.message('infoPanelDefaultTitle')
  const body = chrome.help.text

  return (
    <aside
      className="dg20-info-panel"
      lang={chrome.lang}
      role="note"
      aria-labelledby={titleId}
      data-dg20-widget="info-panel"
    >
      <p className="dg20-info-panel-title" id={titleId}>
        {regionLabel}
      </p>
      <p className="dg20-info-panel-body">{body}</p>
    </aside>
  )
}

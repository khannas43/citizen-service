import type { FormDefinition } from '@citizen/form-contract'
import { FormRenderer } from '@citizen/form-renderer'
import type { FormRendererChangeData } from '@citizen/form-renderer'
import { progressiveStructureKey, familyRepeaterPreviewStructureKey } from '../authoring/index.js'
import type { BuilderLocale } from '../locale/builder-messages.js'
import { builderMessage } from '../locale/builder-messages.js'

export interface PreviewPaneProps {
  readonly locale: BuilderLocale
  readonly definition: FormDefinition
  readonly formData: Readonly<Record<string, unknown>>
  readonly onFormDataChange: (data: Readonly<Record<string, unknown>>) => void
}

export function PreviewPane({ locale, definition, formData, onFormDataChange }: PreviewPaneProps) {
  const structureKey = `${progressiveStructureKey(definition)}|${familyRepeaterPreviewStructureKey(definition)}`

  return (
    <aside
      className="dg20-builder-pane dg20-builder-preview"
      aria-labelledby="dg20-builder-preview-heading"
      data-family-structure-key={familyRepeaterPreviewStructureKey(definition)}
    >
      <h2 id="dg20-builder-preview-heading" className="dg20-builder-pane__title">
        {builderMessage(locale, 'previewHeading')}
      </h2>
      <p className="dg20-builder-preview__note">{builderMessage(locale, 'previewNote')}</p>
      <div className="dg20-builder-preview__frame">
        <FormRenderer
          key={structureKey}
          mode="preview"
          definition={definition}
          locale={locale}
          showLocaleToggle={false}
          formData={formData}
          onChange={(change: FormRendererChangeData) => {
            onFormDataChange(change.formData)
          }}
        />
      </div>
    </aside>
  )
}

import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { ErrorSchema, RJSFSchema, UiSchema } from '@rjsf/utils'
import { useEffect, useState, type ReactElement } from 'react'

import type { BilingualContent, PrefillBinding } from '@dg20/form-contract'

import type { FieldIdResolver } from '../runtime/field-id.js'
import type { WidgetMessageOverrides } from '../runtime/messages.js'
import type { WidgetServicePorts } from '../runtime/service-ports.js'
import { WidgetRuntimeProvider } from '../runtime/widget-context.js'
import { dg20Fields, dg20Widgets } from './registry.js'

export interface DemoFormProps {
  readonly schema: RJSFSchema
  readonly uiSchema?: UiSchema
  readonly bilingual: BilingualContent
  readonly locale?: 'en' | 'gu'
  readonly disabled?: boolean
  readonly readOnly?: boolean
  readonly formData?: Record<string, unknown>
  readonly liveValidate?: boolean
  readonly extraErrors?: ErrorSchema
  readonly showErrorList?: false | 'top' | 'bottom'
  readonly services?: WidgetServicePorts
  readonly resolveFieldId?: FieldIdResolver
  readonly messageOverrides?: WidgetMessageOverrides
  readonly prefillBindings?: readonly PrefillBinding[]
  readonly feeContextRevision?: string
  readonly eSignContextRevision?: string
}

export function DemoForm({
  schema,
  uiSchema,
  bilingual,
  locale = 'en',
  disabled,
  readOnly,
  formData: initial,
  liveValidate = false,
  extraErrors,
  showErrorList = false,
  services,
  resolveFieldId,
  messageOverrides,
  prefillBindings,
  feeContextRevision,
  eSignContextRevision,
}: DemoFormProps): ReactElement {
  const [formData, setFormData] = useState<Record<string, unknown>>(initial ?? {})

  useEffect(() => {
    setFormData(initial ?? {})
  }, [initial])

  return (
    <div className={`dg20-form-widgets${locale === 'gu' ? ' dg20-locale-gu' : ''}`}>
      <WidgetRuntimeProvider
        locale={locale}
        bilingual={bilingual}
        disabled={disabled}
        readOnly={readOnly}
        services={services}
        resolveFieldId={resolveFieldId}
        messageOverrides={messageOverrides}
        prefillBindings={prefillBindings}
        feeContextRevision={feeContextRevision}
        eSignContextRevision={eSignContextRevision}
      >
        <Form
          schema={schema}
          uiSchema={uiSchema}
          formData={formData}
          validator={validator}
          widgets={dg20Widgets}
          fields={dg20Fields}
          liveValidate={liveValidate}
          extraErrors={extraErrors}
          showErrorList={showErrorList}
          disabled={disabled}
          readonly={readOnly}
          onChange={(event) => setFormData((event.formData ?? {}) as Record<string, unknown>)}
          onSubmit={() => undefined}
        >
          <button type="submit" className="dg20-visually-hidden">
            Submit
          </button>
        </Form>
      </WidgetRuntimeProvider>
    </div>
  )
}

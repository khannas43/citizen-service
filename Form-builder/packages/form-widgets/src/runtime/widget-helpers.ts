import type { WidgetProps, FieldProps, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils'

import { resolveFieldIdentity } from './field-id.js'
import { resolveFieldErrorMessages } from './error-resolution.js'
import { htmlLangForLocale, resolveLocalizedText } from './localized-text.js'
import {
  resolveWidgetMessage,
  type WidgetMessageKey,
  type WidgetMessageParams,
} from './messages.js'
import { useNestedFieldIdentityScope } from './nested-field-identity.js'
import { useWidgetRuntime } from './widget-context.js'

export type Dg20WidgetProps = WidgetProps<unknown, StrictRJSFSchema, RJSFSchema>
export type Dg20FieldProps = FieldProps<unknown, StrictRJSFSchema, RJSFSchema>

/**
 * Canonical fieldId is the exact RJSF `name`. Do not split HTML/RJSF IDs.
 * @deprecated Prefer useFieldChrome().definitionFieldId / instanceFieldId
 */
export function fieldIdFromIdSchema(_idSchema: { $id?: string } | undefined, name: string): string {
  return name
}

export function useFieldChrome(props: {
  readonly idSchema?: { $id?: string }
  /** RJSF control id — preferred when idSchema.$id is absent on widgets. */
  readonly id?: string
  readonly name: string
  readonly label?: unknown
  readonly required?: boolean
  readonly rawErrors?: string[] | undefined
  readonly schema?: { description?: string; title?: string } | undefined
}) {
  const runtime = useWidgetRuntime()
  const scope = useNestedFieldIdentityScope()
  const identity = resolveFieldIdentity({
    name: props.name,
    idSchema: props.idSchema,
    resolver: runtime.resolveFieldId,
    definitionPrefix: scope?.definitionPrefix,
    instancePrefix: scope?.instancePrefix,
  })
  const definitionFieldId = identity.definitionFieldId
  const instanceFieldId = identity.instanceFieldId
  /**
   * Compatibility alias for instanceFieldId (adapter / async identity).
   * Bilingual metadata must use definitionFieldId.
   */
  const fieldId = instanceFieldId

  const rjsfLabel =
    typeof props.label === 'string'
      ? props.label
      : typeof props.schema?.title === 'string'
        ? props.schema.title
        : undefined

  const label = resolveLocalizedText({
    bilingual: runtime.bilingual,
    fieldId: definitionFieldId,
    kind: 'labels',
    locale: runtime.locale,
    fallbackEn: rjsfLabel,
  })

  const help = resolveLocalizedText({
    bilingual: runtime.bilingual,
    fieldId: definitionFieldId,
    kind: 'help',
    locale: runtime.locale,
    fallbackEn: props.schema?.description,
  })

  const errorMessages = resolveFieldErrorMessages({
    bilingual: runtime.bilingual,
    fieldId: definitionFieldId,
    locale: runtime.locale,
    rawErrors: props.rawErrors,
  })
  const hasError = errorMessages.length > 0

  const schemaId =
    typeof props.idSchema?.$id === 'string' && props.idSchema.$id.length > 0
      ? props.idSchema.$id
      : undefined
  const rjsfId = typeof props.id === 'string' && props.id.length > 0 ? props.id : undefined
  const rjsfControlId = schemaId ?? rjsfId
  // DOM ids use RJSF-generated ids only — never canonical field identities.
  const chromeBase = rjsfControlId ? `${rjsfControlId}__dg20` : `dg20-control`
  const controlId = rjsfControlId ?? chromeBase
  const helpId = help.text ? `${chromeBase}-help` : undefined
  const errorId = hasError ? `${chromeBase}-error` : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined

  function message(key: WidgetMessageKey, params?: WidgetMessageParams): string {
    return resolveWidgetMessage(key, runtime.locale, params, runtime.messageOverrides)
  }

  return {
    runtime,
    /** @deprecated Compatibility alias of instanceFieldId — prefer instanceFieldId. */
    fieldId,
    definitionFieldId,
    instanceFieldId,
    label,
    help,
    errorMessages,
    hasError,
    controlId,
    helpId,
    errorId,
    describedBy,
    lang: htmlLangForLocale(runtime.locale),
    disabled: Boolean(runtime.disabled),
    readOnly: Boolean(runtime.readOnly),
    required: Boolean(props.required),
    message,
  }
}

export function schemaNumber(
  schema: { minimum?: number; maximum?: number; multipleOf?: number } | undefined,
  key: 'minimum' | 'maximum' | 'multipleOf',
): number | undefined {
  const value = schema?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function schemaMaxLength(schema: { maxLength?: number } | undefined): number | undefined {
  if (typeof schema?.maxLength === 'number') {
    return schema.maxLength
  }
  return undefined
}

/** Parse a decimal input string to a finite number, or undefined when empty/invalid. */
export function parseDecimalInput(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed === '.' || trimmed === '-') {
    return undefined
  }
  if (!/^\d+(\.\d*)?$/.test(trimmed) && !/^\.\d+$/.test(trimmed)) {
    return undefined
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return undefined
  }
  return value
}

/** Format a number for currency editing without float noise (max 2 dp). */
export function formatCurrencyDisplay(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return ''
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
    return ''
  }
  return value.toFixed(2)
}

import type { BilingualContent } from '@citizen/form-contract'

import { resolveLocalizedText, type WidgetLocale } from './localized-text.js'

export interface ResolveFieldErrorsOptions {
  readonly bilingual: BilingualContent | undefined
  readonly fieldId: string
  readonly locale: WidgetLocale
  readonly rawErrors: readonly string[] | undefined
}

/**
 * Resolves citizen-visible validation messages for a field.
 *
 * Prefer `meta.bilingual.errors[fieldId]` for the active locale (GU→EN draft
 * fallback). If metadata is absent, fall back to RJSF `rawErrors` for draft
 * preview. Never repeat the same localized metadata message for multiple
 * rawErrors entries.
 */
export function resolveFieldErrorMessages(options: ResolveFieldErrorsOptions): readonly string[] {
  const raw =
    options.rawErrors?.map((message) => message.trim()).filter((message) => message.length > 0) ??
    []
  if (raw.length === 0) {
    return []
  }

  const fromMeta = resolveLocalizedText({
    bilingual: options.bilingual,
    fieldId: options.fieldId,
    kind: 'errors',
    locale: options.locale,
  })

  if (fromMeta.text.trim().length > 0) {
    return [fromMeta.text]
  }

  return raw
}

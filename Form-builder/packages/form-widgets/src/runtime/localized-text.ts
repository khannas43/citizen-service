import type { BilingualContent, LocalizedValue } from '@citizen/form-contract'

/** Supported runtime locales for widget chrome and field copy. */
export type WidgetLocale = 'en' | 'gu'

/** Which bilingual map to resolve for a field. */
export type BilingualKind = 'labels' | 'help' | 'errors'

export interface ResolveLocalizedOptions {
  readonly bilingual: BilingualContent | undefined
  readonly fieldId: string
  readonly kind: BilingualKind
  readonly locale: WidgetLocale
  /**
   * Optional LocalizedValue consulted before FormDefinition.meta.bilingual maps.
   * Prefer bilingual metadata — do not use ui:options for form copy.
   */
  readonly explicit?: LocalizedValue | undefined
  /** Last-resort English string when nothing else is available (draft preview). */
  readonly fallbackEn?: string
}

export interface LocalizedResolution {
  readonly text: string
  readonly localeUsed: WidgetLocale | 'fallback'
  /** True when requested locale text was missing and English/fallback was used. */
  readonly usedFallback: boolean
}

function pickFromPair(
  pair: LocalizedValue | undefined,
  locale: WidgetLocale,
): { text: string; localeUsed: WidgetLocale | 'fallback'; usedFallback: boolean } | undefined {
  if (!pair) {
    return undefined
  }
  const preferred = locale === 'gu' ? pair.gu : pair.en
  if (preferred.trim().length > 0) {
    return { text: preferred, localeUsed: locale, usedFallback: false }
  }
  if (pair.en.trim().length > 0) {
    return { text: pair.en, localeUsed: 'en', usedFallback: locale === 'gu' }
  }
  if (pair.gu.trim().length > 0) {
    return { text: pair.gu, localeUsed: 'gu', usedFallback: locale === 'en' }
  }
  return undefined
}

/**
 * Resolves user-visible field text from bilingual metadata.
 * Missing Gujarati falls back to English for draft preview — this is not
 * bilingual completeness (server validator still requires both).
 */
export function resolveLocalizedText(options: ResolveLocalizedOptions): LocalizedResolution {
  const fromExplicit = pickFromPair(options.explicit, options.locale)
  if (fromExplicit) {
    return fromExplicit
  }

  const map = options.bilingual?.[options.kind]
  const fromMeta = pickFromPair(map?.[options.fieldId], options.locale)
  if (fromMeta) {
    return fromMeta
  }

  if (options.fallbackEn && options.fallbackEn.trim().length > 0) {
    return {
      text: options.fallbackEn,
      localeUsed: 'fallback',
      usedFallback: true,
    }
  }

  return { text: '', localeUsed: 'fallback', usedFallback: true }
}

/** HTML `lang` attribute value for the active locale. */
export function htmlLangForLocale(locale: WidgetLocale): string {
  return locale === 'gu' ? 'gu' : 'en'
}

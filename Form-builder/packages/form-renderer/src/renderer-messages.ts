import type { FormRendererLocale, FormRendererMessageKey } from './renderer-types.js'

type MessagePair = { readonly en: string; readonly gu: string }

const RENDERER_MESSAGES: Readonly<Record<FormRendererMessageKey, MessagePair>> = {
  localeEnglish: {
    en: 'English',
    gu: 'અંગ્રેજી',
  },
  localeGujarati: {
    en: 'Gujarati',
    gu: 'ગુજરાતી',
  },
  localeToggleGroup: {
    en: 'Language',
    gu: 'ભાષા',
  },
  previewBanner: {
    en: 'Preview mode — changes and submissions here are not sent to production.',
    gu: 'પૂર્વાવલોકન મોડ — અહીંના ફેરફારો અને સબમિશન ઉત્પાદનમાં મોકલવામાં આવતા નથી.',
  },
  submit: {
    en: 'Submit',
    gu: 'સબમિટ કરો',
  },
  formUnavailable: {
    en: 'This form is unavailable. Please try again later or contact support.',
    gu: 'આ ફોર્મ ઉપલબ્ધ નથી. કૃપા કરીને પછીથી ફરી પ્રયાસ કરો અથવા સહાયનો સંપર્ક કરો.',
  },
  formUnpublished: {
    en: 'This form is not available for submission.',
    gu: 'આ ફોર્મ સબમિશન માટે ઉપલબ્ધ નથી.',
  },
  validationGuidance: {
    en: 'Please correct the highlighted fields before submitting.',
    gu: 'સબમિટ કરતા પહેલાં હાઇલાઇટ કરેલા ફીલ્ડ્સ સુધારો.',
  },
  stepValidationGuidance: {
    en: 'Please correct the highlighted fields before continuing.',
    gu: 'આગળ વધતા પહેલાં હાઇલાઇટ કરેલા ફીલ્ડ્સ સુધારો.',
  },
  fullValidationGuidance: {
    en: 'Some answers need correction. Please review the highlighted fields.',
    gu: 'કેટલાક જવાબો સુધારવાની જરૂર છે. કૃપા કરીને હાઇલાઇટ કરેલા ફીલ્ડ્સ તપાસો.',
  },
  stepProgress: {
    en: 'Step {current} of {total}',
    gu: 'પગલું {current} / {total}',
  },
  navBack: {
    en: 'Back',
    gu: 'પાછળ',
  },
  navNext: {
    en: 'Next',
    gu: 'આગળ',
  },
  stepNavLabel: {
    en: 'Form steps',
    gu: 'ફોર્મ પગલાં',
  },
  activeStepHeading: {
    en: 'Current step',
    gu: 'વર્તમાન પગલું',
  },
  autosaveSaving: {
    en: 'Saving progress…',
    gu: 'પ્રગતિ સાચવી રહ્યા છીએ…',
  },
  autosaveSaved: {
    en: 'Progress saved.',
    gu: 'પ્રગતિ સાચવાઈ.',
  },
  autosaveFailed: {
    en: 'Progress could not be saved. Please try again.',
    gu: 'પ્રગતિ સાચવી શકાઈ નહીં. કૃપા કરીને ફરી પ્રયાસ કરો.',
  },
  autosaveRetry: {
    en: 'Retry saving',
    gu: 'સાચવવાનો ફરી પ્રયાસ',
  },
  resumeLoading: {
    en: 'Loading saved progress…',
    gu: 'સાચવેલી પ્રગતિ લોડ થઈ રહી છે…',
  },
  resumeFailed: {
    en: 'Saved progress could not be loaded. Please try again.',
    gu: 'સાચવેલી પ્રગતિ લોડ થઈ શકી નહીં. કૃપા કરીને ફરી પ્રયાસ કરો.',
  },
  resumeRetry: {
    en: 'Retry loading',
    gu: 'લોડનો ફરી પ્રયાસ',
  },
  resumeConfigUnavailable: {
    en: 'Saved progress is temporarily unavailable. You can continue with a new application.',
    gu: 'સાચવેલી પ્રગતિ હાલમાં ઉપલબ્ધ નથી. તમે નવી અરજી સાથે આગળ વધી શકો છો.',
  },
}

function applyParams(template: string, params?: Readonly<Record<string, string | number>>): string {
  if (!params) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key]
    return value === undefined ? `{${key}}` : String(value)
  })
}

export function resolveRendererMessage(
  key: FormRendererMessageKey,
  locale: FormRendererLocale,
  params?: Readonly<Record<string, string | number>>,
): string {
  const pair = RENDERER_MESSAGES[key]
  const preferred = locale === 'gu' ? pair.gu : pair.en
  const text = preferred.trim().length > 0 ? preferred : pair.en
  return applyParams(text, params)
}

export function getRendererMessageCatalogue(): Readonly<
  Record<FormRendererMessageKey, MessagePair>
> {
  return RENDERER_MESSAGES
}

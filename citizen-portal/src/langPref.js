import { loadCitizenProfile } from './auth'

function prefKey() {
  const profile = loadCitizenProfile()
  const aadhaarRef = profile?.aadhaarRef
  return aadhaarRef ? `citizen_lang_pref_set_${aadhaarRef}` : 'citizen_lang_pref_set'
}

export function shouldPromptLanguage() {
  return !localStorage.getItem(prefKey())
}

export function markLanguagePreferenceSet() {
  localStorage.setItem(prefKey(), '1')
}

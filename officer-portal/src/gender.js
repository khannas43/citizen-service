import { tr } from './i18n/lang'

// One list of genders for the whole officer portal. M, F, T and N are the standard codes; O is kept so older records that say "Other" still read properly.
export const GENDER_CODES = ['M', 'F', 'T', 'N']
export const genderText = (g) => {
  if (!g) return ''
  const k = String(g).trim().toUpperCase().charAt(0)
  return { M: tr('Male'), F: tr('Female'), T: tr('Transgender'), N: tr('Not disclosed'), O: tr('Other') }[k] || g
}
export const GENDER_OPTIONS = [['M', 'Male'], ['F', 'Female'], ['T', 'Transgender'], ['N', 'Not disclosed']]

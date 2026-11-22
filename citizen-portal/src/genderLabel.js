// One place that turns a gender code into words: M male, F female, T transgender, N not disclosed. O is kept so older records that say "Other" still read properly.
export function genderLabel(code, t) {
  if (!code) return ''
  const k = String(code).trim().toUpperCase().charAt(0)
  return ['M', 'F', 'T', 'N', 'O'].includes(k) ? t(`genders.${k}`) : code
}

/** Voice eligibility: slot merge, required-field prompts, spoken summaries. */

const REQUIRED_ORDER = ['ageOrDob', 'gender', 'casteCategory', 'district']

export function mergeVoiceSlots(prior, incoming) {
  const out = { ...(prior || {}) }
  for (const [k, v] of Object.entries(incoming || {})) {
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

export function missingRequiredFromSlots(slots) {
  const missing = []
  if (!slots?.age && !slots?.dob) missing.push('ageOrDob')
  if (!slots?.gender) missing.push('gender')
  if (!slots?.casteCategory) missing.push('casteCategory')
  if (!slots?.district) missing.push('district')
  return missing
}

export function nextRequiredField(missing) {
  if (!missing?.length) return null
  for (const key of REQUIRED_ORDER) {
    if (missing.includes(key)) return key
  }
  return missing[0]
}

export function slotsToFormPatch(slots) {
  const patch = {}
  if (slots.age != null) patch.age = String(slots.age)
  if (slots.dob) patch.dob = slots.dob
  if (slots.gender) patch.gender = slots.gender
  if (slots.casteCategory) patch.casteCategory = slots.casteCategory
  if (slots.district) patch.district = slots.district
  if (slots.maritalStatus) patch.maritalStatus = slots.maritalStatus
  if (slots.employmentStatus) patch.employmentStatus = slots.employmentStatus
  if (slots.educationLevel) patch.educationLevel = slots.educationLevel
  if (slots.village) patch.village = slots.village
  if (slots.annualIncome != null) {
    patch.annualIncome = Number(slots.annualIncome).toLocaleString('en-IN')
  }
  return patch
}

export function formToVoiceSlots(form) {
  const incomeDigits = String(form.annualIncome || '').replace(/[^\d]/g, '')
  return mergeVoiceSlots({}, {
    age: form.age ? Number(form.age) : undefined,
    dob: form.dob || undefined,
    gender: form.gender || undefined,
    casteCategory: form.casteCategory || undefined,
    district: form.district || undefined,
    maritalStatus: form.maritalStatus || undefined,
    employmentStatus: form.employmentStatus || undefined,
    educationLevel: form.educationLevel || undefined,
    village: form.village || undefined,
    annualIncome: incomeDigits ? Number(incomeDigits) : undefined,
  })
}

export function schemeDisplayName(m, lang) {
  if (lang === 'gu' && m.schemeNameGujarati) return m.schemeNameGujarati
  return m.schemeName
}

export function buildEligibilitySpeechSummary(result, lang, t) {
  const likely = (result?.matches || []).filter((m) => (m.outcome || (m.eligible ? 'LIKELY_ELIGIBLE' : 'NOT_ELIGIBLE')) === 'LIKELY_ELIGIBLE')
  const possible = (result?.matches || []).filter((m) => m.outcome === 'POSSIBLE')
  const topNames = likely.slice(0, 3).map((m) => schemeDisplayName(m, lang))
  const likelyCount = result.likelyCount ?? likely.length
  const possibleCount = result.possibleCount ?? possible.length

  let text = t('voiceEligibility.summaryCounts', { likely: likelyCount, possible: possibleCount })
  if (topNames.length) {
    text += ` ${t('voiceEligibility.summaryTopSchemes', { names: topNames.join(', ') })}`
  }
  if (possibleCount > 0) {
    text += ` ${t('voiceEligibility.summaryPossibleHint')}`
  }
  return text
}

export function containsLongDigitSequence(text) {
  return /\d{10,}/.test(text || '')
}

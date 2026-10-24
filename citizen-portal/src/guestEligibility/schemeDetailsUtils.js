/** Per-criterion status for the scheme details modal, derived from the scheme's eligibility match. */

// Which reason line (text produced by the guest evaluator) belongs to which criterion key.
const REASON_PATTERNS = {
  age: /^age\b/i,
  gender: /^gender\b/i,
  casteCategory: /^caste\b/i,
  annualIncome: /^income\b|annual family income/i,
  district: /district|limited to/i,
  maritalStatus: /marital/i,
  employmentStatus: /employment|occupation/i,
  village: /village|rural/i,
  examType: /exam|scholarship/i,
  examPercentile: /exam|scholarship|percentile/i,
}

const KEY_ALIASES = {
  marital_status: 'maritalStatus',
  employment: 'employmentStatus',
  caste: 'casteCategory',
  income: 'annualIncome',
}

export function normalizeCriterionKey(key) {
  const k = String(key)
  return KEY_ALIASES[k] || k
}

/**
 * @returns {'met'|'not_met'|'needs'|null} null = unknown (show no icon rather than guess).
 */
export function criterionStatusFromMatch(criterionKey, match) {
  if (!match || !criterionKey) return null
  const key = normalizeCriterionKey(criterionKey)

  const missing = (match.missingFields || []).map(normalizeCriterionKey)
  if (missing.includes(key)) return 'needs'

  const pattern = REASON_PATTERNS[key]
  const reasons = (match.reasons || []).filter((r) => r && typeof r === 'object')
  if (pattern && reasons.length) {
    const related = reasons.filter((r) => pattern.test(String(r.text || '')))
    if (related.some((r) => r.passed === false)) return 'not_met'
    if (related.length && related.every((r) => r.passed === true)) return 'met'
  }

  // No per-criterion reasons available: a fully likely scheme means every criterion passed.
  const outcome = match.outcome || (match.eligible ? 'LIKELY_ELIGIBLE' : 'NOT_ELIGIBLE')
  if (!reasons.length && outcome === 'LIKELY_ELIGIBLE') return 'met'
  return null
}

export const GUEST_PROFILE_KEY = 'dg20_guest_eligibility_profile'

export function loadGuestEligibilitySession() {
  try {
    const raw = sessionStorage.getItem(GUEST_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function findMatchForScheme(schemeId) {
  if (!schemeId) return null
  const session = loadGuestEligibilitySession()
  const matches = session?.result?.matches
  if (!Array.isArray(matches)) return null
  return matches.find((m) => m.schemeId === schemeId) || null
}

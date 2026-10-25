export const FAMILY_API =
  import.meta.env.VITE_FAMILY_API ||
  (import.meta.env.DEV ? 'http://localhost:8085/family-registry-service' : '/family-registry-service')
export const SCHEME_API =
  import.meta.env.VITE_SCHEME_API ||
  (import.meta.env.DEV ? 'http://localhost:8086/scheme-engine-service' : '/scheme-engine-service')
export const CITIZEN_PORTAL =
  import.meta.env.VITE_CITIZEN_PORTAL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:31174`
    : 'http://localhost:5174')

const AADHAAR_PATTERN = /^[\dXx]{4}-[\dXx]{4}-[\dXx]{4}$/

export function looksLikeAadhaar(q) {
  return AADHAAR_PATTERN.test(q.trim())
}

export async function searchPersons(query) {
  const q = query.trim()
  if (!q) return []
  const param = looksLikeAadhaar(q)
    ? `aadhaar=${encodeURIComponent(q)}`
    : `q=${encodeURIComponent(q)}`
  const res = await fetch(`${FAMILY_API}/v1/persons/search?${param}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.results ?? []
}

export function schemeIdForName(schemes, schemeName) {
  const norm = schemeName.replace(/_/g, ' ').toLowerCase()
  return schemes.find(
    (s) =>
      s.name?.toLowerCase().includes(norm.split(' ')[0]) ||
      norm.includes(s.name?.toLowerCase().split(' ')[0] || '')
  )?.id
}

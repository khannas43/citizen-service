import { getCitizenLandingUrl } from './portalUrls'

export const AUTH_API =
  import.meta.env.VITE_AUTH_API ||
  (import.meta.env.DEV ? 'http://localhost:8087/auth-service' : '/auth-service')

const KEYCLOAK_URL =
  import.meta.env.VITE_KEYCLOAK_URL ||
  (import.meta.env.DEV ? 'http://localhost:8090' : '')

export const OFFICER_TOKEN_URL = `${KEYCLOAK_URL}/realms/citizen/protocol/openid-connect/token`

export async function verifyCitizenToken(token) {
  const res = await fetch(`${AUTH_API}/v1/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Invalid token')
  return res.json()
}

export function loadCitizenProfile() {
  try {
    return JSON.parse(localStorage.getItem('citizen_profile') || 'null')
  } catch {
    return null
  }
}

export function logoutCitizen() {
  localStorage.removeItem('citizen_token')
  localStorage.removeItem('citizen_profile')
  window.location.href = getCitizenLandingUrl()
}

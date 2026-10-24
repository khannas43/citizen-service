/** Officer portal base URL — env override or same host on NodePort 30073. */
export function getOfficerPortalUrl() {
  const env = import.meta.env.VITE_OFFICER_PORTAL_URL
  if (env) return env.replace(/\/$/, '')
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:30073`
}

/** Citizen landing / home URL — env override or same host on NodePort 30074. */
export function getCitizenLandingUrl() {
  const env = import.meta.env.VITE_CITIZEN_PORTAL_URL
  if (env) return env.replace(/\/$/, '') + '/'
  const { protocol, hostname } = window.location
  // Already on citizen portal (30074) → stay on this origin
  if (String(window.location.port || '') === '30074' || !window.location.port) {
    return `${protocol}//${window.location.host}/`
  }
  return `${protocol}//${hostname}:30074/`
}

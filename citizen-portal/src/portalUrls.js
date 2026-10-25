/** Officer portal base URL — env override or same host on NodePort 31173. */
export function getOfficerPortalUrl() {
  const env = import.meta.env.VITE_OFFICER_PORTAL_URL
  if (env) return env.replace(/\/$/, '')
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:31173`
}

/** Citizen landing / home URL — env override or same host on NodePort 31174. */
export function getCitizenLandingUrl() {
  const env = import.meta.env.VITE_CITIZEN_PORTAL_URL
  if (env) return env.replace(/\/$/, '') + '/'
  const { protocol, hostname } = window.location
  // Already on citizen portal (31174) → stay on this origin
  if (String(window.location.port || '') === '31174' || !window.location.port) {
    return `${protocol}//${window.location.host}/`
  }
  return `${protocol}//${hostname}:31174/`
}

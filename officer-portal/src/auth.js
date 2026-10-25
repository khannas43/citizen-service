export const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8090'
export const TOKEN_URL = `${KEYCLOAK_URL}/realms/citizen/protocol/openid-connect/token`

export const OFFICER_ROLES = [
  'DATA_ENTRY_OFFICER',
  'TALATI',
  'REVENUE_OFFICER',
  'SCHEME_DEPT',
  'DEPT_ADMIN',
  'IT_ADMIN',
  'SENIOR_MGMT',
  'PAYROLL_REVIEWER',
  'FINANCE_OFFICER',
  'HR_OFFICER',
]

/** Login / JWT aliases → canonical officer_role. */
const ROLE_ALIASES = {
  TALATI: 'TALATI',
  MAMLATDAR: 'TALATI',
  DATA_ENTRY_OFFICER: 'DATA_ENTRY_OFFICER',
  DATA_ENTRY: 'DATA_ENTRY_OFFICER',
  REVENUE_OFFICER: 'REVENUE_OFFICER',
  REVENUE: 'REVENUE_OFFICER',
  SCHEME_DEPT: 'SCHEME_DEPT',
  SCHEME_DEPARTMENT: 'SCHEME_DEPT',
  DEPT_ADMIN: 'DEPT_ADMIN',
  DEPARTMENT_ADMIN: 'DEPT_ADMIN',
  IT_ADMIN: 'IT_ADMIN',
  SENIOR_MGMT: 'SENIOR_MGMT',
  SENIOR_MANAGEMENT: 'SENIOR_MGMT',
}

export function normalizeOfficerRole(role) {
  const key = String(role || '')
    .trim()
    .toUpperCase()
    .replace(/[\s.-]+/g, '_')
  if (!key) return 'UNKNOWN'
  return ROLE_ALIASES[key] ?? (OFFICER_ROLES.includes(key) ? key : 'UNKNOWN')
}

export function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

export function isOfficerTokenValid(token) {
  if (!token) return false
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return false
  return payload.exp > Date.now() / 1000
}

export function extractOfficerRole(payload) {
  const roles = payload?.realm_access?.roles ?? []
  const matched = roles.map((r) => normalizeOfficerRole(r)).find((r) => r !== 'UNKNOWN')
  return matched ?? 'UNKNOWN'
}

/** Citizen landing page — env override or same host on NodePort 31174. */
export function getCitizenLandingUrl() {
  const env = import.meta.env.VITE_CITIZEN_PORTAL_URL
  if (env) return env.replace(/\/$/, '') + '/'
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:31174/`
}

export function logoutOfficer() {
  localStorage.removeItem('officer_token')
  localStorage.removeItem('officer_role')
  localStorage.removeItem('officer_name')
  localStorage.removeItem('officer_district')
  window.location.href = getCitizenLandingUrl()
}

/** District a role is locked to. Statewide roles return null. */
export function districtForOfficer(username, role) {
  const user = String(username || '').trim().toLowerCase()
  const normalized = normalizeOfficerRole(role)
  if (normalized === 'SCHEME_DEPT' || user === 'scheme.dept') return 'Ahmedabad'
  return null
}

export function persistOfficerSession({ token, role, name, username, district, sub }) {
  localStorage.setItem('officer_token', token)
  localStorage.setItem('officer_role', role || 'UNKNOWN')
  localStorage.setItem('officer_name', name || 'Officer')
  if (sub) localStorage.setItem('officer_sub', sub)
  else localStorage.removeItem('officer_sub')
  const scoped = district ?? districtForOfficer(username, role)
  if (scoped) localStorage.setItem('officer_district', scoped)
  else localStorage.removeItem('officer_district')
}

export function getOfficerDistrictScope() {
  try {
    const stored = localStorage.getItem('officer_district')
    if (stored && stored.trim()) return stored.trim()
    return districtForOfficer(null, localStorage.getItem('officer_role'))
  } catch {
    return null
  }
}

export function matchesOfficerDistrict(value, scope = getOfficerDistrictScope()) {
  if (!scope) return true
  return String(value || '').trim().toLowerCase() === scope.toLowerCase()
}

export function scopeRowsToOfficerDistrict(rows, getDistrict) {
  const scope = getOfficerDistrictScope()
  if (!scope || !Array.isArray(rows)) return rows ?? []
  return rows.filter((row) => matchesOfficerDistrict(getDistrict(row), scope))
}

/** Max admitted Bearer credential length (FB-E5.4.1). */
export const OFFICER_ACCESS_TOKEN_MAX_CHARS = 8192

/**
 * Read the current officer access token at call time (FB-E5.4.1).
 * Does not decode or validate JWT claims — FDS remains authoritative.
 * @returns {string | null}
 */
export function getOfficerAccessToken() {
  try {
    const raw = localStorage.getItem('officer_token')
    if (typeof raw !== 'string') return null
    return raw
  } catch {
    return null
  }
}

/**
 * Admit a Bearer credential for outbound governance HTTP only.
 * Rejects blank, whitespace/control/CRLF, and oversized values.
 * @param {unknown} token
 * @returns {{ ok: true, token: string } | { ok: false }}
 */
export function admitOfficerAccessToken(token) {
  if (typeof token !== 'string') return { ok: false }
  if (token.length === 0 || token.length > OFFICER_ACCESS_TOKEN_MAX_CHARS) return { ok: false }
  if (token !== token.trim()) return { ok: false }
  if (/\s/.test(token)) return { ok: false }
  for (let i = 0; i < token.length; i += 1) {
    const code = token.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return { ok: false }
  }
  return { ok: true, token }
}

function taskRoleHaystack(task) {
  return [task?.assignee, task?.candidateGroups, task?.currentTask]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function filterTasksByRole(tasks, role) {
  const normalized = normalizeOfficerRole(role)
  if (!normalized || normalized === 'DEPT_ADMIN' || normalized === 'IT_ADMIN') return tasks
  return tasks.filter((task) => {
    const hay = taskRoleHaystack(task)
    switch (normalized) {
      case 'DATA_ENTRY_OFFICER':
        return hay.includes('data-entry-officer') || hay.includes('data entry')
      case 'TALATI':
        return hay.includes('talati')
      case 'REVENUE_OFFICER':
        return hay.includes('revenue-officer') || hay.includes('revenue officer')
      case 'SCHEME_DEPT':
        return task.service === 'Scheme Application'
      default:
        return false
    }
  })
}

/** Portal screens a role may open. Form Builder is gated separately by JWT roles. */
const ROLE_FEATURES = {
  TALATI: ['home', 'tasks', 'grievances', 'families'],
  SCHEME_DEPT: [
    'home', 'tasks', 'grievances', 'families', 'schemes', 'schemeContent', 'beneficiaries', 'simulator',
    'coverage', 'reports', 'analytics', 'expenditureIntegrity', 'moneyOverview', 'story',
  ],
  DATA_ENTRY_OFFICER: ['home', 'tasks', 'grievances', 'coverage', 'families'],
  REVENUE_OFFICER: ['home', 'tasks', 'grievances', 'fraud', 'expenditureIntegrity', 'coverage', 'families'],
  DEPT_ADMIN: [
    'home', 'tasks', 'grievances', 'schemes', 'schemeContent', 'beneficiaries', 'simulator',
    'fraud', 'expenditureIntegrity', 'dataImport', 'moneyOverview', 'story', 'coverage', 'families', 'reports', 'analytics',
  ],
  IT_ADMIN: ['home', 'ops', 'reports', 'analytics', 'expenditureIntegrity', 'dataImport', 'moneyOverview'],
  SENIOR_MGMT: ['moneyOverview', 'coverage', 'analytics', 'reports'],
  // payroll and finance roles work in Expenditure Integrity only (Keycloak roles to be created; the screen and service already honour them)
  PAYROLL_REVIEWER: ['home', 'expenditureIntegrity'],
  FINANCE_OFFICER: ['home', 'expenditureIntegrity'],
  HR_OFFICER: ['home', 'expenditureIntegrity'],
  UNKNOWN: ['home', 'tasks'],
}

/** First screen after login. Senior management goes straight to analytics. */
export function officerLandingPath(role) {
  return normalizeOfficerRole(role) === 'SENIOR_MGMT' ? '/analytics' : '/'
}

export const OFFICER_NAV_CATALOG = [
  { to: '/', label: '🏠 Home', end: true, feature: 'home' },
  { to: '/ops-dashboard', label: '🖥 Ops Dashboard', feature: 'ops' },
  { to: '/tasks', label: '📋 Task Queue', feature: 'tasks' },
  { to: '/grievances', label: '🔔 Grievances', feature: 'grievances' },
  { to: '/schemes', label: '🏛 Scheme Management', feature: 'schemes' },
  { to: '/scheme-content', label: '📝 Scheme Content', feature: 'schemeContent' },
  { to: '/beneficiaries', label: '👥 Beneficiaries', feature: 'beneficiaries' },
  { to: '/scheme-simulator', label: '🔮 Scheme Simulator', feature: 'simulator' },
  { to: '/money-overview', label: '🗺 Money Overview', feature: 'moneyOverview' },
  { to: '/expenditure-integrity', label: '💰 Expenditure', feature: 'expenditureIntegrity' },
  { to: '/fraud-signals/legacy', label: '🚨 Scheme Overlapping (legacy)', feature: 'fraud' },
  { to: '/coverage', label: '📊 Scheme Coverage', feature: 'coverage' },
  { to: '/families', label: '🔍 Family Registry', feature: 'families' },
  { to: '/analytics', label: '📊 Platform Analytics', feature: 'analytics' },
  { to: '/reports', label: '📈 Reports', feature: 'reports' },
]

const PATH_FEATURES = {
  ...Object.fromEntries(OFFICER_NAV_CATALOG.map((item) => [item.to, item.feature])),
  '/story': 'story',
  '/data': 'dataImport',
}

export function officerHasFeature(role, feature) {
  const normalized = normalizeOfficerRole(role)
  return (ROLE_FEATURES[normalized] ?? ROLE_FEATURES.UNKNOWN).includes(feature)
}

export function officerCanAccessPath(role, pathname) {
  const path = String(pathname || '').split('?')[0]
  const feature = PATH_FEATURES[path]
  if (!feature) return true
  return officerHasFeature(role, feature)
}

export function officerNavItems(role) {
  return OFFICER_NAV_CATALOG.filter((item) => officerHasFeature(role, item.feature))
}

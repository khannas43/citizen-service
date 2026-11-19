export const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8090'
export const TOKEN_URL = `${KEYCLOAK_URL}/realms/citizen/protocol/openid-connect/token`

export const OFFICER_ROLES = [
  'DATA_ENTRY_OFFICER',
  'TALATI',
  'REVENUE_OFFICER',
  'SCHEME_DEPT',
  'DEPT_ADMIN',
  'IT_ADMIN',
  'MDM_ADMIN',
  'SENIOR_MGMT',
  'PAYROLL_REVIEWER',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'PDS_OFFICER',
  'HEALTH_OFFICER',
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
  PDS_OFFICER: 'PDS_OFFICER',
  PDS: 'PDS_OFFICER',
  HEALTH_OFFICER: 'HEALTH_OFFICER',
  HEALTH: 'HEALTH_OFFICER',
}

/** Department code for a department-scoped officer role. */
export const DEPT_ROLE_CODES = { PDS_OFFICER: 'pds', HEALTH_OFFICER: 'health' }
export const DEPT_ROLE_LABELS = {
  PDS_OFFICER: 'Civil supplies (PDS)',
  HEALTH_OFFICER: 'Health',
}

export function departmentForRole(role) {
  return DEPT_ROLE_CODES[normalizeOfficerRole(role)] || null
}

export function departmentLabel(role) {
  return DEPT_ROLE_LABELS[normalizeOfficerRole(role)] || null
}

/** Roles that may run the daily checks. The service decides in the end; a role without access sees its refusal. */
export function isAdminRole(role) {
  return ['MDM_ADMIN', 'ADMIN', 'IT_ADMIN'].includes(String(role || '').trim().toUpperCase())
}

export function isDeptOfficerRole(role) {
  return !!departmentForRole(role)
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
  localStorage.removeItem('officer_username')
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
  try { localStorage.removeItem('officer_nav_groups') } catch { /* ignore */ }   // every sign-in starts with the menu closed
  localStorage.setItem('officer_role', role || 'UNKNOWN')
  localStorage.setItem('officer_name', name || 'Officer')
  const user = String(username || '').trim()
  if (user) localStorage.setItem('officer_username', user)
  else localStorage.removeItem('officer_username')
  if (sub) localStorage.setItem('officer_sub', sub)
  else localStorage.removeItem('officer_sub')
  const scoped = district ?? districtForOfficer(username, role)
  if (scoped) localStorage.setItem('officer_district', scoped)
  else localStorage.removeItem('officer_district')
}

/** English label for the officer role shown in the header (translated via tr()). */
export const ROLE_DISPLAY = {
  PDS_OFFICER: 'Civil supplies officer',
  HEALTH_OFFICER: 'Health officer',
  TALATI: 'Talati',
  DEPT_ADMIN: 'Department admin',
  IT_ADMIN: 'IT admin',
  MDM_STEWARD: 'MDM steward',
  MDM_ADMIN: 'MDM admin',
  SENIOR_MGMT: 'Senior management',
  REVENUE_OFFICER: 'Revenue officer',
  SCHEME_DEPT: 'Scheme department',
  DATA_ENTRY_OFFICER: 'Data entry officer',
}

/** Header identity: role label once, username once (never duplicate the given name as the role). */
export function headerIdentity(role, { name, username } = {}) {
  const key = String(role || '').trim().toUpperCase().replace(/[\s.-]+/g, '_')
  const normalized = normalizeOfficerRole(role)
  const roleLabel = ROLE_DISPLAY[normalized] || ROLE_DISPLAY[key] || (normalized !== 'UNKNOWN' ? normalized : key) || 'Officer'
  const who = String(username || '').trim() || String(name || '').trim() || 'Officer'
  return { roleLabel, username: who }
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
    'fraud', 'expenditureIntegrity', 'dataImport', 'moneyOverview', 'story', 'coverage', 'families', 'reports', 'analytics', 'mdm',
  ],
  IT_ADMIN: ['home', 'ops', 'reports', 'analytics', 'expenditureIntegrity', 'dataImport', 'moneyOverview', 'mdm'],
  // master data administrator: every Data Exchange screen, the daily checks and the reports (the service still decides what each call may do)
  MDM_ADMIN: ['home', 'tasks', 'reports', 'analytics', 'mdm', 'mdmDept'],
  SENIOR_MGMT: ['moneyOverview', 'coverage', 'analytics', 'reports'],
  // payroll and finance roles work in Expenditure Integrity only (Keycloak roles to be created; the screen and service already honour them)
  PAYROLL_REVIEWER: ['home', 'expenditureIntegrity'],
  FINANCE_OFFICER: ['home', 'expenditureIntegrity'],
  HR_OFFICER: ['home', 'expenditureIntegrity'],
  PDS_OFFICER: ['home', 'mdmDept'],
  HEALTH_OFFICER: ['home', 'mdmDept'],
  UNKNOWN: ['home', 'tasks'],
}

/** First screen after login. Senior management goes straight to analytics. */
export function officerLandingPath(role) {
  const normalized = normalizeOfficerRole(role)
  if (normalized === 'SENIOR_MGMT') return '/analytics'
  if (normalized === 'PDS_OFFICER') return '/dx/work'
  if (normalized === 'HEALTH_OFFICER') return '/dx/control'
  return '/'
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
  { to: '/fraud-signals/legacy', label: '🚨 Scheme Overlapping', feature: 'fraud' },
  { to: '/coverage', label: '📊 Scheme Coverage', feature: 'coverage' },
  { to: '/families', label: '🔍 Family Registry', feature: 'families' },
  { to: '/dx/control', label: '🗼 Control Tower', feature: 'mdmDept', also: 'mdm' },
  { to: '/dx/events', label: '📡 Event Stream', feature: 'mdm' },
  { to: '/dx/work', label: '✅ Work queue', feature: 'mdmDept', also: 'mdm' },
  { to: '/dx/approvals', label: '✅ Approvals', feature: 'mdmDept', also: 'mdm' },
  { to: '/dx/notices', label: '📨 Department Notices', feature: 'mdmDept', also: 'mdm' },
  { to: '/dx/discrepancies', label: '⚠️ Discrepancies', feature: 'mdm' },
  { to: '/mdm', label: '🧬 Master Data', feature: 'mdm' },
  { to: '/dx/lineage', label: '🧬 Data Lineage', feature: 'mdm' },
  { to: '/dx/quality', label: '✅ Feed Quality', feature: 'mdm' },
  { to: '/dx/checks', label: '🧮 Eligibility Checks', feature: 'mdm' },
  { to: '/dx/query', label: '🧮 Query Builder', feature: 'mdm' },
  { to: '/dx/verify', label: '🔎 Verification Queries', feature: 'mdm' },
  { to: '/dx/ledger', label: '🧾 Clearing House', feature: 'mdm' },
  { to: '/dx/catalogue', label: '📚 Catalogue', feature: 'mdm' },
  { to: '/dx/registry', label: '🗂 Registry', feature: 'mdm' },
  { to: '/dx/standards', label: '📐 Data Standards', feature: 'mdm' },
  { to: '/dx/consent', label: '🤝 Consent', feature: 'mdmDept', also: 'mdm' },
  { to: '/dx/policy', label: '📜 Policy', feature: 'mdm' },
  { to: '/dx/response-times', label: '⏱ Response Times', feature: 'mdm' },
  { to: '/dx/audit', label: '🔐 Audit', feature: 'mdm' },
  { to: '/dx/retention', label: '🧹 Retention & Purge', feature: 'mdm' },
  { to: '/dx/connectors', label: '🔌 Connectors', feature: 'mdm' },
  { to: '/dx/keys', label: '🔑 Security & Keys', feature: 'mdm' },
  { to: '/dx/access', label: '🛡 Access & Misuse', feature: 'mdm' },
  { to: '/dx/api', label: '🧪 API Explorer', feature: 'mdm' },
  { to: '/dx/assisted', label: '🧑‍💼 Assisted Channel', feature: 'mdm' },
  { to: '/dx/story', label: '🗺 How the Pieces Fit', feature: 'mdm' },
  { to: '/dx/scenarios', label: '🎬 Scenario Runner', feature: 'mdm' },
  { to: '/dx/inject', label: '⚡ Unscripted Events', feature: 'mdm' },
  { to: '/dx/evidence', label: '📦 Evidence Pack', feature: 'mdm' },
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

function itemVisibleTo(role, item) {
  if (officerHasFeature(role, item.feature)) return true
  if (item.also && officerHasFeature(role, item.also)) return true
  return false
}

export function officerCanAccessPath(role, pathname) {
  const raw = String(pathname || '')
  const path = raw.split('?')[0]
  const qs = raw.includes('?') ? new URLSearchParams(raw.slice(raw.indexOf('?') + 1)) : null
  const normalized = normalizeOfficerRole(role)
  const deptOnly = isDeptOfficerRole(normalized)
  if (deptOnly && path === '/dx/control' && qs?.get('tab') === 'overview') return false
  // A group page /dx/work/<REASON> is part of the Work queue (batch approval lives there); nothing deeper is.
  const lookupPath = deptOnly && /^\/dx\/work\/[A-Za-z0-9_-]+$/.test(path) ? '/dx/work' : path
  const feature = PATH_FEATURES[lookupPath]
  if (deptOnly) {
    if (!feature) {
      if (path === '/mdm' || path.startsWith('/mdm/') || path.startsWith('/dx/')) return false
      return path === '/' || path === ''
    }
    const item = OFFICER_NAV_CATALOG.find((i) => i.to === lookupPath)
    return item ? itemVisibleTo(normalized, item) : false
  }
  if (!feature) return true
  const item = OFFICER_NAV_CATALOG.find((i) => i.to === path)
  if (item) return itemVisibleTo(normalized, item)
  return officerHasFeature(role, feature)
}

export function officerNavItems(role) {
  return OFFICER_NAV_CATALOG.filter((item) => itemVisibleTo(role, item))
}

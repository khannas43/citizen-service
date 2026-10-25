import { getOfficerAccessToken, getOfficerDistrictScope, logoutOfficer, matchesOfficerDistrict } from './auth'

const rel = (path, port) => (import.meta.env.DEV ? `http://localhost:${port}${path}` : path)

export const CASTE_API =
  import.meta.env.VITE_CASTE_API || rel('/caste-certificate-service', 8080)
export const MARRIAGE_API =
  import.meta.env.VITE_MARRIAGE_API || rel('/marriage-certificate-service', 8081)
export const PENSION_API =
  import.meta.env.VITE_PENSION_API || rel('/pension-service', 8082)
export const FAMILY_MB_API =
  import.meta.env.VITE_FAMILY_MB_API || rel('/family-member-service', 8083)
export const SCHEME_APP_API =
  import.meta.env.VITE_SCHEME_APP_API || rel('/scheme-application-service', 8084)
export const FAMILY_API =
  import.meta.env.VITE_FAMILY_API || rel('/family-registry-service', 8085)
export const SCHEME_API =
  import.meta.env.VITE_SCHEME_API || rel('/scheme-engine-service', 8086)
export const INTEGRITY_API =
  import.meta.env.VITE_INTEGRITY_API || rel('/expenditure-integrity-service', 8092)
export const GRIEVANCE_API =
  import.meta.env.VITE_GRIEVANCE_API || rel('/grievance-service', 8089)
export const NOTIFICATIONS_API =
  import.meta.env.VITE_NOTIFICATIONS_API || rel('/notifications-service', 8099)
/** AI service base — relative path in prod (officer nginx proxies /ai-intelligence-service/). */
function resolveAiBase() {
  const fromEnv = (import.meta.env.VITE_AI_BASE ?? '').trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (import.meta.env.DEV) return 'http://localhost:31189'
  return '/ai-intelligence-service'
}

export const AI_BASE = resolveAiBase()

export const SERVICE_FETCHERS = [
  { service: 'Caste Certificate', base: CASTE_API },
  { service: 'Marriage Certificate', base: MARRIAGE_API },
  { service: 'Pension', base: PENSION_API },
  { service: 'Family Member Change', base: FAMILY_MB_API },
  { service: 'Scheme Application', base: SCHEME_APP_API },
]

export function approveBaseForTask(task) {
  if (task.engineRef?.startsWith('DGT-')) return MARRIAGE_API
  switch (task.service) {
    case 'Caste Certificate':
      return CASTE_API
    case 'Marriage Certificate':
      return MARRIAGE_API
    case 'Pension':
      return PENSION_API
    case 'Family Member Change':
      return FAMILY_MB_API
    case 'Scheme Application':
      return SCHEME_APP_API
    default:
      return CASTE_API
  }
}

export function displayName(task) {
  return task.applicantName || task.personName || task.schemeName || 'Unknown Applicant'
}

export function taskMeta(task) {
  if (task.service === 'Pension') return task.pensionType
  if (task.service === 'Family Member Change') return `${task.changeType}: ${task.personName || ''}`
  if (task.service === 'Scheme Application') return task.schemeName
  if (task.engineRef?.startsWith('DGT-')) return `Spouse: ${task.casteCode || '—'}`
  return task.casteCode
}

async function fetchWithRetry(url, { retries = 2, delayMs = 800, timeoutMs = 20000 } = {}) {
  let res
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      res = await fetch(url, { signal: controller.signal })
    } catch (err) {
      clearTimeout(timer)
      if (attempt === retries - 1) throw err
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      continue
    }
    clearTimeout(timer)
    if (res.ok || ![502, 503, 504].includes(res.status) || attempt === retries - 1) {
      return res
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return res
}

export async function fetchAllTasks(includeCompleted = false) {
  const results = await Promise.allSettled(
    SERVICE_FETCHERS.map(async ({ service, base }) => {
      const qs = (includeCompleted && service === 'Caste Certificate')
        ? '?includeCompleted=true'
        : ''
      const res = await fetchWithRetry(`${base}/v1/applications${qs}`)
      const contentType = res.headers.get('content-type') || ''
      if (!res.ok) throw new Error(`${service} HTTP ${res.status}`)
      if (!contentType.includes('application/json')) {
        throw new Error(`${service} returned non-JSON (check API proxy)`)
      }
      const data = await res.json()
      return data.map((item) => ({ ...item, service }))
    })
  )

  const tasks = []
  const errors = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      tasks.push(...result.value)
    } else {
      errors.push(`${SERVICE_FETCHERS[i].service}: ${result.reason.message}`)
    }
  })

  tasks.sort((a, b) => (a.engineRef || '').localeCompare(b.engineRef || ''))
  return { tasks, errors }
}

export async function fetchApplicationStats() {
  const results = await Promise.allSettled(
    SERVICE_FETCHERS.map(async ({ service, base }) => {
      const res = await fetchWithRetry(`${base}/v1/applications/stats`)
      if (!res.ok) throw new Error(`${service} HTTP ${res.status}`)
      const data = await res.json()
      return { service, ...data }
    })
  )

  const stats = []
  const errors = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      stats.push(result.value)
    } else {
      errors.push(`${SERVICE_FETCHERS[i].service}: ${result.reason.message}`)
    }
  })
  return { stats, errors }
}

export async function fetchDashboardAnalytics({ district, schemeId } = {}) {
  const params = new URLSearchParams()
  if (district && district !== 'ALL') params.set('district', district)
  if (schemeId && schemeId !== 'ALL') params.set('schemeId', schemeId)
  const query = params.toString()
  const url = `${AI_BASE}/v1/analytics/dashboard${query ? `?${query}` : ''}`
  const res = await fetch(url)
  const contentType = res.headers.get('content-type') || ''
  if (!res.ok) throw new Error(`Dashboard analytics fetch failed (HTTP ${res.status})`)
  if (!contentType.includes('application/json')) {
    throw new Error('Dashboard analytics returned non-JSON (check AI proxy / VITE_AI_BASE)')
  }
  return res.json()
}

export { filterTasksByRole, getOfficerDistrictScope, matchesOfficerDistrict, scopeRowsToOfficerDistrict } from './auth'

// SLA hours per service (matches BPMN timer boundary events)
export const SLA_HOURS = {
  'Caste Certificate': 24,
  Pension: 48,
  'Family Member Change': 24,
  'Scheme Application': 48,
  'Marriage Certificate': 72,
}

// Returns 'red' | 'amber' | 'green' | null
export function slaUrgency(createdAt, slaHours) {
  if (!createdAt || !slaHours) return null
  const start = new Date(createdAt).getTime()
  if (Number.isNaN(start)) return null
  const deadline = start + slaHours * 3_600_000
  const remaining = deadline - Date.now()
  if (remaining <= 0) return 'red'
  if (remaining < 3_600_000) return 'red'
  if (remaining < 6 * 3_600_000) return 'amber'
  return 'green'
}

export function taskCreatedAt(task) {
  return task?.createdAt ?? task?.created_at ?? task?.submittedAt ?? null
}

/** Maps every queue task to a single SLA bucket for filters and sorting. */
export function taskSlaUrgency(task) {
  if (!task) return null
  const status = task.status || 'PENDING'
  if (status === 'ESCALATED') return 'red'
  if (status === 'APPROVED') return 'green'
  const hours = SLA_HOURS[task.service]
  const urgency = slaUrgency(taskCreatedAt(task), hours)
  return urgency ?? 'green'
}

export function slaLabel(createdAt, slaHours) {
  if (!createdAt || !slaHours) return null
  const deadline = new Date(createdAt).getTime() + slaHours * 3_600_000
  const remaining = deadline - Date.now()
  if (remaining <= 0) return '⚠ SLA BREACHED'
  const h = Math.floor(remaining / 3_600_000)
  const m = Math.floor((remaining % 3_600_000) / 60_000)
  if (h === 0) return `⏱ ${m}m remaining`
  return `⏱ ${h}h ${m}m remaining`
}

export function sortBySlaPriority(tasks) {
  const order = { red: 0, amber: 1, green: 2, null: 3, undefined: 3 }
  return [...tasks].sort((a, b) => {
    const ua = taskSlaUrgency(a)
    const ub = taskSlaUrgency(b)
    return (order[ua] ?? 3) - (order[ub] ?? 3)
  })
}

export async function fetchSchemeCoverage() {
  const maxAttempts = 3
  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${SCHEME_API}/v1/schemes/coverage`)
      if (res.ok) return res.json()
      if (res.status >= 500 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 1500))
        continue
      }
      throw new Error(`Coverage fetch failed (${res.status})`)
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 1500))
        continue
      }
    }
  }
  throw lastError ?? new Error('Coverage fetch failed')
}

export async function fetchGeographicBreakdown(schemeId) {
  const res = await fetch(`${SCHEME_API}/v1/schemes/${schemeId}/geographic`)
  if (!res.ok) throw new Error('Geographic fetch failed')
  return res.json()
}

async function fetchGeographicLevel(schemeId, level, { district, taluka, search, sortBy, sortDir, offset, limit } = {}) {
  const params = new URLSearchParams()
  if (district) params.set('district', district)
  if (taluka) params.set('taluka', taluka)
  if (search) params.set('search', search)
  if (sortBy) params.set('sortBy', sortBy)
  if (sortDir) params.set('sortDir', sortDir)
  params.set('offset', String(offset ?? 0))
  params.set('limit', String(limit ?? 15))
  const res = await fetch(`${SCHEME_API}/v1/schemes/${schemeId}/geographic/${level}?${params}`)
  if (!res.ok) throw new Error(`Geographic ${level} fetch failed`)
  return res.json()
}

export function fetchGeographicDistricts(schemeId, opts) {
  return fetchGeographicLevel(schemeId, 'districts', opts)
}

export function fetchGeographicTalukas(schemeId, district, opts) {
  return fetchGeographicLevel(schemeId, 'talukas', { ...opts, district })
}

export function fetchGeographicVillages(schemeId, district, taluka, opts) {
  return fetchGeographicLevel(schemeId, 'villages', { ...opts, district, taluka })
}

export async function fetchSchemeDistribution(schemeId) {
  const res = await fetch(`${SCHEME_API}/v1/schemes/${schemeId}/distribution`)
  if (!res.ok) throw new Error('Distribution fetch failed')
  return res.json()
}

export async function fetchSchemeStatusCounts(schemeId, district) {
  const params = district ? `?district=${encodeURIComponent(district)}` : ''
  const res = await fetch(`${SCHEME_API}/v1/schemes/${schemeId}/status-counts${params}`)
  if (!res.ok) throw new Error('Status counts fetch failed')
  return res.json()
}

export async function fetchBeneficiarySummary({ schemeId, district } = {}) {
  if (schemeId || district) {
    const scope = { schemeId, district, limit: 1 }
    const [identified, active, removed, auto] = await Promise.all([
      fetchBeneficiaryRecent({ ...scope, status: 'IDENTIFIED' }),
      fetchBeneficiaryRecent({ ...scope, status: 'ACTIVE' }),
      fetchBeneficiaryRecent({ ...scope, status: 'REMOVED' }),
      fetchBeneficiaryRecent({ ...scope, autoRemovalsOnly: true }),
    ])
    const identifiedCount = identified.totalMatched ?? 0
    const activeCount = active.totalMatched ?? 0
    const removedCount = removed.totalMatched ?? 0
    return {
      active: activeCount,
      identified: identifiedCount,
      pendingConfirmation: identifiedCount,
      autoRemoved: auto.totalMatched ?? 0,
      total: identifiedCount + activeCount + removedCount,
    }
  }
  const res = await fetch(`${SCHEME_API}/v1/beneficiaries/dashboard/summary`)
  if (!res.ok) throw new Error('Beneficiary summary fetch failed')
  return res.json()
}

export async function fetchBeneficiaryRecent({
  schemeId, status, search, district, taluka, village,
  autoRemovalsOnly, sortBy, sortDir, offset = 0, limit = 20,
} = {}) {
  const params = new URLSearchParams()
  if (schemeId) params.set('schemeId', schemeId)
  if (status && status !== 'ALL') params.set('status', status)
  if (search) params.set('search', search)
  if (district) params.set('district', district)
  if (taluka) params.set('taluka', taluka)
  if (village) params.set('village', village)
  if (autoRemovalsOnly) params.set('autoRemovalsOnly', 'true')
  if (sortBy) params.set('sortBy', sortBy)
  if (sortDir) params.set('sortDir', sortDir)
  params.set('offset', String(offset))
  params.set('limit', String(limit))
  const res = await fetch(`${SCHEME_API}/v1/beneficiaries/dashboard/recent?${params}`)
  if (!res.ok) throw new Error('Beneficiary list fetch failed')
  return res.json()
}

export async function fetchBeneficiaryGeoOptions({ schemeId, district, taluka } = {}) {
  const params = new URLSearchParams()
  if (schemeId) params.set('schemeId', schemeId)
  if (district) params.set('district', district)
  if (taluka) params.set('taluka', taluka)
  const res = await fetch(`${SCHEME_API}/v1/beneficiaries/dashboard/geo-options?${params}`)
  if (!res.ok) throw new Error('Geo options fetch failed')
  return res.json()
}

/** Headers for the scheme-engine endpoints that change beneficiaries: they need the officer's token. */
function officerJsonHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getOfficerAccessToken()}` }
}

function beneficiaryActionError(res, fallback) {
  return res.status === 401 || res.status === 403
    ? 'You do not have permission for this action. Please sign in again.'
    : fallback
}

export async function confirmBeneficiary(id, officerName) {
  const res = await fetch(`${SCHEME_API}/v1/beneficiaries/${id}/confirm`, {
    method: 'POST',
    headers: officerJsonHeaders(),
    body: JSON.stringify({ officerName }),
  })
  if (!res.ok) throw new Error(beneficiaryActionError(res, 'Confirm failed'))
  return res.json()
}

export async function removeBeneficiary(id, reason) {
  const res = await fetch(`${SCHEME_API}/v1/beneficiaries/${id}/remove`, {
    method: 'POST',
    headers: officerJsonHeaders(),
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(beneficiaryActionError(res, 'Remove failed'))
  return res.json()
}

export async function disburseBeneficiary(id, officerName) {
  const res = await fetch(`${SCHEME_API}/v1/beneficiaries/${id}/disburse`, {
    method: 'PATCH',
    headers: officerJsonHeaders(),
    body: JSON.stringify({ officerName }),
  })
  if (!res.ok) throw new Error(beneficiaryActionError(res, 'Disburse failed'))
  return res.json()
}

export async function overrideBeneficiary(id, payload) {
  const res = await fetch(`${SCHEME_API}/v1/beneficiaries/${id}/override`, {
    method: 'PATCH',
    headers: officerJsonHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(beneficiaryActionError(res, 'Override failed'))
  return res.json()
}

export async function fetchBeneficiaryAudit(id) {
  const res = await fetch(`${SCHEME_API}/v1/beneficiaries/${id}/audit`)
  if (!res.ok) throw new Error('Audit fetch failed')
  return res.json()
}

async function postBulk(path, body) {
  const res = await fetch(`${SCHEME_API}/v1/beneficiaries/bulk/${path}`, {
    method: path === 'override' ? 'PATCH' : 'POST',
    headers: officerJsonHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(beneficiaryActionError(res, `Bulk ${path} failed`))
  return res.json()
}

export function bulkConfirmBeneficiaries(ids, officerName) {
  return postBulk('confirm', { ids, officerName })
}

export function bulkRemoveBeneficiaries(ids, reason) {
  return postBulk('remove', { ids, reason })
}

export function bulkOverrideBeneficiaries(ids, payload) {
  return postBulk('override', { ids, ...payload })
}

export async function fetchSchemeCitizens(schemeId, { district, taluka, search, offset = 0, limit = 100 } = {}) {
  const params = new URLSearchParams()
  if (district) params.set('district', district)
  if (taluka) params.set('taluka', taluka)
  if (search) params.set('search', search)
  params.set('offset', String(offset))
  params.set('limit', String(limit))
  const res = await fetch(`${SCHEME_API}/v1/schemes/${schemeId}/citizens?${params}`)
  if (!res.ok) throw new Error('Citizens fetch failed')
  return res.json()
}

export async function fetchAllGrievances() {
  const token = localStorage.getItem('officer_token')
  const res = await fetch(`${GRIEVANCE_API}/v1/grievances/all`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  return res.json()
}

export async function updateGrievance(id, status, officerNotes) {
  const token = localStorage.getItem('officer_token')
  const res = await fetch(`${GRIEVANCE_API}/v1/grievances/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, officerNotes }),
  })
  if (!res.ok) throw new Error('Update failed')
  return res.json()
}

export async function fetchGrievanceThread(id) {
  const token = localStorage.getItem('officer_token')
  const res = await fetch(`${GRIEVANCE_API}/v1/grievances/${id}/thread`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}

export async function addGrievanceComment(id, authorName, commentText, authorType = 'OFFICER') {
  const token = localStorage.getItem('officer_token')
  const res = await fetch(`${GRIEVANCE_API}/v1/grievances/${id}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      authorName,
      authorType,
      commentText,
      attachment: null,
    }),
  })
  if (!res.ok) throw new Error('Failed to add comment')
  return res.json()
}

export async function fetchFraudSignals() {
  const token = localStorage.getItem('officer_token')
  const res = await fetch(`${INTEGRITY_API}/v1/admin/fraud-signals`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  // an empty list must only ever mean "nothing found": refusals and outages are errors
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load scheme-overlap signals'))
  return res.json()
}

function integrityAuthHeaders() {
  const token = localStorage.getItem('officer_token')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function integrityNetworkError(err, fallback) {
  if (err?.name === 'AbortError') {
    return new Error('The request timed out. Try a narrower district, taluka, or pay period.')
  }
  if (err?.message === 'Failed to fetch') {
    return new Error(`${fallback} Could not reach the expenditure integrity service — check that it is running and you are signed in.`)
  }
  return err instanceof Error ? err : new Error(fallback)
}

async function integrityFetch(url, init = {}, timeoutMs = 120000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    throw integrityNetworkError(err, '')
  } finally {
    clearTimeout(timer)
  }
}

/** Turns an integrity-service failure into a message an officer can act on. */
export async function integrityError(res, fallback) {
  if (res.status === 401) return 'Your session has expired. Please sign in again.'
  if (res.status === 403) return 'Your role is not allowed to do this.'
  try {
    const body = await res.json()
    if (body?.message) return body.message
  } catch { /* no JSON body */ }
  return `${fallback} (HTTP ${res.status})`
}

export async function fetchIntegrityAlerts(domain = 'BENEFICIARY', status = 'OPEN', {
  district, taluka, schemeId, ddoCode, actionType, periodStart, periodEnd,
} = {}) {
  const params = new URLSearchParams({ status })
  if (domain) params.set('domain', domain)
  if (district) params.set('district', district)
  if (taluka) params.set('taluka', taluka)
  if (schemeId) params.set('schemeId', schemeId)
  if (ddoCode) params.set('ddoCode', ddoCode)
  if (actionType) params.set('actionType', actionType)
  if (periodStart) params.set('periodStart', periodStart)
  if (periodEnd) params.set('periodEnd', periodEnd)
  const res = await integrityFetch(`${INTEGRITY_API}/v1/alerts?${params}`, {
    headers: integrityAuthHeaders(),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load alerts'))
  return res.json()
}

/** Case file for audit / RTI: HTML (print) or JSON. Requires read access to the case domain. */
export async function fetchCaseFileExport(caseId, format = 'html') {
  const token = localStorage.getItem('officer_token')
  const q = new URLSearchParams({ format })
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/export?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not download the case file'))
  if (format === 'json') return res.json()
  return res.text()
}

export async function fetchIntegrityCase(caseId) {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load the case'))
  return res.json()
}

export async function fetchIntegrityReadiness() {
  const res = await fetch(`${INTEGRITY_API}/v1/admin/readiness`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load data readiness'))
  return res.json()
}

export async function fetchPersonOverview(personKey) {
  const key = encodeURIComponent(personKey)
  const res = await fetch(`${INTEGRITY_API}/v1/people/${key}/overview`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load person view'))
  return res.json()
}

export async function fetchLinkedRegistryIds(personIds) {
  if (!personIds?.length) return { linkedPersonIds: [] }
  const params = new URLSearchParams()
  personIds.forEach((id) => params.append('personIds', id))
  const res = await fetch(`${INTEGRITY_API}/v1/people/linked-registry-ids?${params}`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load payroll links'))
  return res.json()
}

export async function postIntegrityDecision(caseId, classification, decisionText, noticeRequired) {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/decision`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify({ classification, decisionText, noticeRequired }),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not save the decision'))
  return res.json()
}

export async function postIntegrityApproveRecovery(caseId, actionId) {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/actions/${actionId}/approve`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not approve the recovery'))
  return res.json()
}

export async function postIntegrityRejectRecovery(caseId, actionId, reason) {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/actions/${actionId}/reject`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not reject the recovery'))
  return res.json()
}

export async function postIntegrityAction(caseId, actionType, payload) {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/actions`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify({ actionType, payload }),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not record the action'))
  return res.json()
}

export async function runIntegrityDetection(body) {
  const res = await integrityFetch(`${INTEGRITY_API}/v1/admin/run-detection`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify(body),
  }, 600000)
  if (!res.ok) throw new Error(await integrityError(res, 'Detection run failed'))
  return res.json()
}

export async function fetchWhatIfDefaults() {
  const res = await fetch(`${INTEGRITY_API}/v1/admin/what-if/defaults`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load what-if defaults'))
  return res.json()
}

export async function postWhatIf(body) {
  const res = await integrityFetch(`${INTEGRITY_API}/v1/admin/what-if`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify(body),
  }, 300000)
  if (!res.ok) throw new Error(await integrityError(res, 'What-if run failed'))
  return res.json()
}

export async function fetchIntegrityMetrics(domain) {
  const q = domain ? `?domain=${encodeURIComponent(domain)}` : ''
  const res = await fetch(`${INTEGRITY_API}/v1/admin/metrics${q}`, { headers: integrityAuthHeaders() })
  if (!res.ok) return null
  return res.json()
}

export async function fetchPayrollFilterOptions({ district, taluka } = {}) {
  const params = new URLSearchParams()
  if (district) params.set('district', district)
  if (taluka) params.set('taluka', taluka)
  const q = params.toString()
  const res = await fetch(`${INTEGRITY_API}/v1/payroll/filter-options${q ? `?${q}` : ''}`, {
    headers: integrityAuthHeaders(),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load payroll filter options'))
  return res.json()
}

export async function fetchIntegrityTalukaCoverage() {
  const res = await fetch(`${INTEGRITY_API}/v1/admin/taluka-coverage`, { headers: integrityAuthHeaders() })
  if (!res.ok) return []
  return res.json()
}

export async function fetchSchemes() {
  const token = localStorage.getItem('officer_token')
  let lastStatus
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${SCHEME_API}/v1/schemes`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      lastStatus = res.status
      if (res.ok) return res.json()
      if (![502, 503, 504].includes(res.status) || attempt === 2) break
    } catch {
      if (attempt === 2) break
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return []
}

export async function runSimulation(baseSchemeId, parameters, ruleId = null, conditions = null, conditionLogic = null) {
  const token = localStorage.getItem('officer_token')
  const body = JSON.stringify({
    baseSchemeId: baseSchemeId || null,
    parameters,
    ruleId: ruleId || null,
    conditions: conditions || null,
    conditionLogic: conditionLogic || null,
  })
  let lastStatus
  let lastDetail = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${SCHEME_API}/v1/schemes/simulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      })
      lastStatus = res.status
      if (res.ok) return res.json()
      const detail = await res.text().catch(() => '')
      lastDetail = detail.includes('502 Bad Gateway') || detail.includes('503')
        ? 'Scheme engine is temporarily unavailable — retrying…'
        : detail.replace(/<[^>]+>/g, ' ').trim().slice(0, 200)
      if (![502, 503, 504].includes(res.status) || attempt === 2) {
        throw new Error(lastDetail || `Simulation failed (HTTP ${res.status})`)
      }
    } catch (err) {
      if (err?.name === 'TypeError' && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      if (attempt === 2 || ![502, 503, 504].includes(lastStatus)) {
        throw new Error(err?.message?.includes('Simulation failed') || err?.message?.includes('unavailable')
          ? err.message
          : 'Simulation failed — scheme engine may be restarting. Wait a few seconds and try again.')
      }
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(lastDetail || `Simulation failed (HTTP ${lastStatus})`)
}

export async function fetchRules() {
  const token = localStorage.getItem('officer_token')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${SCHEME_API}/v1/rules`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) return res.json()
      if (![502, 503, 504].includes(res.status) || attempt === 2) return []
    } catch {
      if (attempt === 2) return []
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return []
}

export async function saveRule(name, conditionLogic, conditions, createdBy) {
  const token = localStorage.getItem('officer_token')
  const res = await fetch(`${SCHEME_API}/v1/rules`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, conditionLogic, conditions, createdBy }),
  })
  if (!res.ok) throw new Error('Failed to save rule')
  return res.json()
}

export async function deleteRule(id) {
  const token = localStorage.getItem('officer_token')
  const res = await fetch(`${SCHEME_API}/v1/rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to delete rule')
}

export function certificateDownloadUrl(engineRef) {
  return `${CASTE_API}/v1/applications/${encodeURIComponent(engineRef)}/certificate`
}

export async function fetchPendingClarifications() {
  const res = await fetch(`${GRIEVANCE_API}/v1/clarifications/pending`)
  if (!res.ok) return []
  return res.json()
}

export async function answerClarification(id, answer) {
  const res = await fetch(`${GRIEVANCE_API}/v1/clarifications/${id}/answer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (!res.ok) throw new Error('Answer failed')
  return res.json()
}

async function schemeContentAdminFetch(path, init = {}) {
  const token = getOfficerAccessToken()
  const headers = {
    ...(init.headers || {}),
    Authorization: `Bearer ${token}`,
  }
  if (init.body != null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${SCHEME_API}/v1/admin/scheme-content${path}`, { ...init, headers })
  if (res.status === 401) {
    logoutOfficer()
    throw new Error('Session expired')
  }
  if (res.status === 403) {
    const err = new Error('You do not have permission to edit scheme content.')
    err.code = 'FORBIDDEN'
    throw err
  }
  return res
}

export async function fetchSchemeContentList() {
  const res = await schemeContentAdminFetch('')
  if (!res.ok) throw new Error(`Scheme content list failed (HTTP ${res.status})`)
  return res.json()
}

export async function fetchSchemeContent(schemeId) {
  const res = await schemeContentAdminFetch(`/${encodeURIComponent(schemeId)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Scheme content load failed (HTTP ${res.status})`)
  return res.json()
}

export async function saveSchemeContent(schemeId, body) {
  const res = await schemeContentAdminFetch(`/${encodeURIComponent(schemeId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (res.status === 409) {
    const err = new Error('Version conflict')
    err.code = 'CONFLICT'
    err.status = 409
    try {
      err.body = await res.json()
    } catch {
      err.body = { message: 'Version conflict' }
    }
    throw err
  }
  if (res.status === 400) {
    const data = await res.json().catch(() => ({}))
    const err = new Error('Validation failed')
    err.code = 'VALIDATION'
    err.fieldErrors = data.fieldErrors ?? {}
    throw err
  }
  if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`)
  return res.json()
}

export async function fetchSchemeContentHistory(schemeId) {
  const res = await schemeContentAdminFetch(`/${encodeURIComponent(schemeId)}/history`)
  if (!res.ok) throw new Error(`History failed (HTTP ${res.status})`)
  return res.json()
}

export async function fetchOpsSummary() {
  const token = localStorage.getItem('officer_token')
  const res = await fetch(`${SCHEME_API}/v1/admin/ops-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Ops summary failed')
  return res.json()
}

export async function triggerBirthdayCheck(date) {
  const token = localStorage.getItem('officer_token')
  const qs = date ? `?date=${encodeURIComponent(date)}` : ''
  const res = await fetch(`${SCHEME_API}/v1/admin/trigger-birthday-check${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Birthday check failed')
  return res.json()
}

export const HEALTH_SERVICES = [
  { name: 'Caste Certificate', path: '/caste-certificate-service/actuator/health' },
  { name: 'Marriage Certificate', path: '/marriage-certificate-service/actuator/health' },
  { name: 'Pension', path: '/pension-service/actuator/health' },
  { name: 'Family Member', path: '/family-member-service/actuator/health' },
  { name: 'Scheme Application', path: '/scheme-application-service/actuator/health' },
  { name: 'Family Registry', path: '/family-registry-service/actuator/health' },
  { name: 'Scheme Engine', path: '/scheme-engine-service/actuator/health' },
  { name: 'Grievance', path: '/grievance-service/actuator/health' },
  { name: 'Notifications', path: '/notifications-service/actuator/health' },
  { name: 'Chatbot', path: '/chatbot-service/actuator/health' },
]

export async function fetchCitizenPerson(aadhaarRef) {
  const res = await fetch(`${FAMILY_API}/v1/persons/search?aadhaar=${encodeURIComponent(aadhaarRef)}`)
  if (!res.ok) return null
  const data = await res.json()
  const list = data.results ?? data
  if (!Array.isArray(list) || !list.length) return null
  const exact = list.find((p) => p.aadhaarRef === aadhaarRef)
  return exact ?? list[0]
}

const personDistrictCache = new Map()

export async function resolvePersonDistrict(aadhaarRef) {
  if (!aadhaarRef) return null
  if (personDistrictCache.has(aadhaarRef)) return personDistrictCache.get(aadhaarRef)
  const person = await fetchCitizenPerson(aadhaarRef)
  const district = person?.district || null
  personDistrictCache.set(aadhaarRef, district)
  return district
}

/** Keep records in the officer's district. Uses a direct district field when present, else family registry. */
export async function filterRecordsByOfficerDistrict(records, getAadhaar, getDistrict) {
  const scope = getOfficerDistrictScope()
  if (!scope || !Array.isArray(records)) return records ?? []
  const kept = []
  for (const record of records) {
    const direct = getDistrict?.(record)
    if (direct) {
      if (matchesOfficerDistrict(direct, scope)) kept.push(record)
      continue
    }
    const district = await resolvePersonDistrict(getAadhaar?.(record))
    if (matchesOfficerDistrict(district, scope)) kept.push(record)
  }
  return kept
}

export async function fetchTalukasForDistrict(district) {
  if (!district?.trim()) return []
  const res = await fetch(`${FAMILY_API}/v1/geography/talukas?district=${encodeURIComponent(district.trim())}`)
  if (!res.ok) return []
  return res.json()
}

export async function fetchVillagesForTaluka(district, taluka) {
  if (!district?.trim() || !taluka?.trim()) return []
  const params = new URLSearchParams({ district: district.trim(), taluka: taluka.trim() })
  const res = await fetch(`${FAMILY_API}/v1/geography/villages?${params}`)
  if (!res.ok) return []
  return res.json()
}

export async function searchPersons(criteria = {}, signal = undefined) {
  const params = new URLSearchParams()
  Object.entries(criteria).forEach(([key, value]) => {
    if (value != null && String(value).trim() !== '') {
      params.set(key, String(value).trim())
    }
  })
  if (!params.has('limit')) {
    params.set('limit', '50')
  }
  const res = await fetch(`${FAMILY_API}/v1/persons/search?${params}`, { signal })
  if (!res.ok) {
    throw new Error('Search failed')
  }
  const data = await res.json()
  if (Array.isArray(data)) {
    return {
      results: data,
      totalMatched: data.length,
      limited: false,
      limit: Number(params.get('limit')) || 50,
    }
  }
  return data
}

export async function fetchCitizenFamily(familyId) {
  const res = await fetch(`${FAMILY_API}/v1/families/${familyId}`)
  if (!res.ok) return null
  return res.json()
}

export async function fetchCitizenDocumentsMeta(aadhaarRef) {
  if (!aadhaarRef) return []
  const res = await fetch(`${FAMILY_API}/v1/documents?aadhaar=${encodeURIComponent(aadhaarRef)}`)
  if (!res.ok) return []
  const data = await res.json()
  if (Array.isArray(data)) return data
  return data.results ?? data.documents ?? []
}

export async function pingServiceHealth(path) {
  try {
    const res = await fetch(path)
    if (!res.ok) return false
    const data = await res.json()
    return data.status === 'UP'
  } catch {
    return false
  }
}

export async function fetchApplicationByRef(task) {
  if (!task?.engineRef) return task
  const base = approveBaseForTask(task)
  const res = await fetch(`${base}/v1/applications/${encodeURIComponent(task.engineRef)}`)
  if (!res.ok) return task
  const data = await res.json()
  return { ...task, ...data, service: task.service }
}

export function applicationRefsOf(task) {
  return new Set([task?.engineRef, task?.applicationNo].filter(Boolean))
}

export function clarificationMatchesApp(clarification, task) {
  const refs = applicationRefsOf(task)
  return refs.has(clarification?.applicationRef) || (clarification?.displayRef && refs.has(clarification.displayRef))
}

export async function fetchClarificationsForApplication(task) {
  if (!task) return []
  const refs = [...applicationRefsOf(task)]
  const fetches = refs.map(async (ref) => {
    const res = await fetch(`${GRIEVANCE_API}/v1/clarifications?applicationRef=${encodeURIComponent(ref)}`)
    if (!res.ok) return []
    return res.json()
  })
  if (task.aadhaarRef) {
    fetches.push(
      fetch(`${GRIEVANCE_API}/v1/clarifications?aadhaar=${encodeURIComponent(task.aadhaarRef)}`)
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
    )
  }
  const lists = await Promise.all(fetches)
  const map = new Map()
  lists.flat().forEach((item) => {
    if (item?.id && clarificationMatchesApp(item, task)) map.set(item.id, item)
  })
  return [...map.values()].sort((a, b) => new Date(a.askedAt || 0) - new Date(b.askedAt || 0))
}

export async function sendInfoRequest(aadhaarRef, engineRef, displayRef, serviceName, queryText, officerName) {
  const res = await fetch(`${GRIEVANCE_API}/v1/clarifications/info-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aadhaarRef,
      applicationRef: engineRef,
      displayRef: displayRef || engineRef,
      serviceName,
      query: queryText,
      officerName,
    }),
  })
  if (!res.ok) throw new Error('Failed to send request')
  return res.json()
}

export async function fetchCitizenResponses() {
  const res = await fetch(`${GRIEVANCE_API}/v1/clarifications/citizen-responses`)
  if (!res.ok) return []
  return res.json()
}

export const INTEGRITY_MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** Eight CSV loaders for expenditure integrity (see docs/EXPENDITURE_INTEGRITY_DATA_LOADING.md). */
export const INTEGRITY_IMPORTS = [
  {
    name: 'units',
    label: 'Entitlement units',
    group: 'beneficiary',
    columns: 'id?, scheme_id, scheme_name, person_id, person_name, district, taluka, village?, authorized_amount, period_start, period_end?, family_id?',
    needs: 'Nothing — load this before settlements.',
    hint: 'A unit whose id already exists is skipped. Taluka is required for taluka-level demo data reporting.',
  },
  {
    name: 'settlements',
    label: 'Settlements',
    group: 'beneficiary',
    columns: 'unit_id, period_start, period_end, amount, status, bank_token, transaction_ref?, reversal_of?',
    needs: 'Entitlement units',
    hint: 'status: SETTLED, PENDING, REJECTED, FAILED. A reversal has a negative amount and reversal_of (the payment id it reverses).',
  },
  {
    name: 'verification-events',
    label: 'Death and status records',
    group: 'beneficiary',
    columns: 'person_id, event_type, event_date, source?, confidence?, family_id?',
    needs: 'Nothing',
    hint: 'event_type: DEATH, STATUS_TERMINATION, LIFE_CERT_EXPIRED. confidence defaults to MEDIUM. The same person, type and date is skipped.',
  },
  {
    name: 'employees',
    label: 'Employees',
    group: 'payroll',
    columns: 'employee_code, person_name, ddo_code, post_title, pay_level, status, status_since?, district?, taluka?, person_id?',
    needs: 'Nothing — load this before service events, payroll, pensions and life certificates.',
    hint: 'status: ACTIVE, TRANSFERRED, SUSPENDED, RETIRED, DECEASED. An existing employee_code is updated.',
  },
  {
    name: 'service-events',
    label: 'Service events',
    group: 'payroll',
    columns: 'employee_code, event_type, effective_date, order_ref?',
    needs: 'Employees',
    hint: 'event_type: JOINING, POSTING, TRANSFER, PROMOTION, SUSPENSION, REINSTATEMENT, RETIREMENT, DEATH.',
  },
  {
    name: 'payroll',
    label: 'Payroll',
    group: 'payroll',
    columns: 'employee_code, component, ddo_code, period_start, period_end, gross_amount, net_amount, transaction_ref, reversal_of_ref?',
    needs: 'Employees',
    hint: 'component: BASIC, DA, HRA, TA, ARREARS, PENSION, OTHER. transaction_ref is required so the same file can be loaded twice safely.',
  },
  {
    name: 'pensions',
    label: 'Pensions',
    group: 'payroll',
    columns: 'ppo_id, employee_code, monthly_rate, effective_from, commutation_amount?, recipient_name?',
    needs: 'Employees',
    hint: 'An existing ppo_id is updated. One pension authorisation per employee.',
  },
  {
    name: 'life-certificates',
    label: 'Life certificates',
    group: 'payroll',
    columns: 'employee_code, received_date, reference?',
    needs: 'Employees',
    hint: 'The same employee and date is skipped. Rule S06 treats a pensioner as overdue after 365 days without one.',
  },
]

/** Header row for a template CSV (optional columns drop the trailing ?). */
export function integrityImportTemplateHeader(name) {
  const imp = INTEGRITY_IMPORTS.find((i) => i.name === name)
  if (!imp) throw new Error(`Unknown import: ${name}`)
  return imp.columns
    .split(',')
    .map((c) => c.trim().replace(/\?$/, ''))
    .join(',')
}

export function validateIntegrityImportFile(file) {
  if (!file) return 'Choose a CSV file.'
  const lower = file.name.toLowerCase()
  if (!lower.endsWith('.csv')) return 'Choose a CSV file whose name ends in .csv.'
  if (file.size > INTEGRITY_MAX_UPLOAD_BYTES) return 'The file must be at most 20 MB.'
  return null
}

export async function uploadIntegrityImport(name, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${INTEGRITY_API}/v1/admin/import/${name}`, {
    method: 'POST',
    headers: { Authorization: integrityAuthHeaders().Authorization },
    body: form,
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load the file'))
  return res.json()
}

export async function fetchVerificationEventsLastLoaded() {
  const res = await fetch(`${INTEGRITY_API}/v1/admin/import/verification-events/last`, {
    headers: integrityAuthHeaders(),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load verification-events freshness'))
  return res.json()
}

/** Pre-payment gate: screen a payment file, list files, open one, and decide a flagged line. */
export async function screenPaymentFile(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${INTEGRITY_API}/v1/payment-gate/screen`, {
    method: 'POST',
    headers: { Authorization: integrityAuthHeaders().Authorization },
    body: form,
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not screen the file'))
  return res.json()
}

export async function fetchPaymentBatches() {
  const res = await fetch(`${INTEGRITY_API}/v1/payment-gate/batches`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load payment files'))
  return res.json()
}

export async function fetchPaymentBatch(id, verdict, page = 0, size = 50) {
  const q = new URLSearchParams({ page, size })
  if (verdict) q.set('verdict', verdict)
  const res = await fetch(`${INTEGRITY_API}/v1/payment-gate/batches/${id}?${q}`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load the payment file'))
  return res.json()
}

export async function decidePaymentLine(batchId, lineId, action, reason) {
  const res = await fetch(`${INTEGRITY_API}/v1/payment-gate/batches/${batchId}/lines/${lineId}/decision`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify({ action, reason }),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not save the decision'))
  return res.json()
}

/** Senior-management money picture: totals by district and rule, no personal details. */
export async function fetchIntegrityOverview() {
  const res = await fetch(`${INTEGRITY_API}/v1/overview`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load the money overview'))
  return res.json()
}

/** Closes a case whose outcome is recorded, once someone has checked the fix holds. */
export async function fetchIntegrityNoticeDraft(caseId, lang = 'en') {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/notice?lang=${encodeURIComponent(lang)}`, {
    headers: integrityAuthHeaders(),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load the notice draft'))
  return res.json()
}

export async function postIntegrityNoticeIssue(caseId, language = 'en') {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/notice/issue`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify({ language }),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not mark the notice as issued'))
  return res.json()
}

export async function postIntegrityNoticeResponse(caseId, responseKind, note) {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/notice/response`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify({ responseKind, note }),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not record the notice response'))
  return res.json()
}

export async function postIntegrityReopen(caseId, reason) {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/reopen`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not reopen the case on appeal'))
  return res.json()
}

export async function postIntegrityVerifyClosed(caseId, note) {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/verify-closed`, {
    method: 'POST',
    headers: integrityAuthHeaders(),
    body: JSON.stringify({ note }),
  })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not verify the case closed'))
  return res.json()
}

/** One visual line for a case: entitlement or employment, payments, events and record changes. */
export async function fetchIntegrityTimeline(caseId) {
  const res = await fetch(`${INTEGRITY_API}/v1/cases/${caseId}/timeline`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load the timeline'))
  return res.json()
}

/** The guided demo: three real cases and the pilot summary. */
export async function fetchIntegrityStory() {
  const res = await fetch(`${INTEGRITY_API}/v1/story`, { headers: integrityAuthHeaders() })
  if (!res.ok) throw new Error(await integrityError(res, 'Could not load the guided story'))
  return res.json()
}

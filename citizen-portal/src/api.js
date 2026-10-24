const rel = (path, port) => import.meta.env.DEV ? `http://localhost:${port}${path}` : path

export const APIs = {
  caste: import.meta.env.VITE_CASTE_API || rel('/caste-certificate-service', 8080),
  marriage: import.meta.env.VITE_MARRIAGE_API || rel('/marriage-certificate-service', 8081),
  pension: import.meta.env.VITE_PENSION_API || rel('/pension-service', 8082),
  familyMb: import.meta.env.VITE_FAMILY_MB_API || rel('/family-member-service', 8083),
  scheme: import.meta.env.VITE_SCHEME_APP_API || rel('/scheme-application-service', 8084),
  schemeEngine: import.meta.env.VITE_SCHEME_API || rel('/scheme-engine-service', 8086),
  family: import.meta.env.VITE_FAMILY_API || rel('/family-registry-service', 8085),
  chatbot: import.meta.env.VITE_CHATBOT_API || rel('/chatbot-service', 8088),
  grievance: import.meta.env.VITE_GRIEVANCE_API || rel('/grievance-service', 8089),
  notifications: import.meta.env.VITE_NOTIFICATIONS_API || rel('/notifications-service', 8099),
}

export const SERVICE_LABELS = {
  caste: 'Caste Certificate',
  marriage: 'Marriage Certificate',
  pension: 'Pension Application',
  familyMb: 'Family Member Change',
  scheme: 'Scheme Application',
}

export function apiForService(service) {
  if (service === 'marriage') return APIs.marriage
  return APIs[service]
}

export function loadCitizenApps() {
  try {
    return JSON.parse(localStorage.getItem('citizen_apps') || '[]')
  } catch {
    return []
  }
}

export function saveCitizenApp(entry) {
  const apps = loadCitizenApps()
  apps.push({ ...entry, submittedAt: new Date().toISOString() })
  localStorage.setItem('citizen_apps', JSON.stringify(apps))
}

export async function fetchApplicationStatus(service, engineRef) {
  const base = apiForService(service)
  const res = await fetch(`${base}/v1/applications/${encodeURIComponent(engineRef)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Returns the friendly display number, falling back to a short hash if not yet present
export function displayAppNo(app) {
  if (app.applicationNo) return app.applicationNo
  const PREFIX = { caste: 'CAS', marriage: 'MAR', pension: 'PEN', familyMb: 'FAM', scheme: 'SCH' }
  const raw = (app.engineRef || '').replace(/^FLW-|^DGT-|^LW-/i, '').replace(/-/g, '')
  return `${PREFIX[app.service] || 'APP'}-${raw.slice(0, 6).toUpperCase()}`
}

// Fetch all applications for a citizen from all services in parallel
export async function fetchMyApplications(aadhaarRef) {
  const sources = [
    { service: 'caste',    base: APIs.caste,     label: SERVICE_LABELS.caste },
    { service: 'pension',  base: APIs.pension,   label: SERVICE_LABELS.pension },
    { service: 'scheme',   base: APIs.scheme,    label: SERVICE_LABELS.scheme },
    { service: 'marriage', base: APIs.marriage,  label: SERVICE_LABELS.marriage },
    { service: 'familyMb', base: APIs.familyMb,  label: SERVICE_LABELS.familyMb },
  ]
  const results = await Promise.allSettled(
    sources.map(({ service, base }) =>
      fetch(`${base}/v1/applications?aadhaar=${encodeURIComponent(aadhaarRef)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((items) => items.map((item) => ({ ...item, service })))
    )
  )
  return results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })
}

export async function sendChatMessage(sessionId, message, language = 'en', aadhaarRef = null, currentPage = null) {
  const body = { sessionId, message, language }
  if (aadhaarRef) body.aadhaarRef = aadhaarRef
  if (currentPage) body.currentPage = currentPage
  const res = await fetch(`${APIs.chatbot}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Chat failed')
  return res.json()
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({ name: file.name, type: file.type, data: reader.result.split(',')[1] })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function base64ToBlob(data, type) {
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type })
}

export async function submitGrievance(
  aadhaarRef,
  citizenName,
  trackingRef,
  complaintText,
  category,
  priority,
  attachments = []
) {
  const res = await fetch(`${APIs.grievance}/v1/grievances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aadhaarRef,
      citizenName,
      trackingRef,
      complaintText,
      category,
      priority,
      attachments,
    }),
  })
  if (!res.ok) throw new Error('Failed to submit grievance')
  return res.json()
}

export async function fetchGrievanceThread(id) {
  const res = await fetch(`${APIs.grievance}/v1/grievances/${id}/thread`)
  if (!res.ok) return null
  return res.json()
}

export async function addGrievanceComment(id, authorName, commentText, attachment = null) {
  const res = await fetch(`${APIs.grievance}/v1/grievances/${id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authorName,
      authorType: 'CITIZEN',
      commentText,
      attachment,
    }),
  })
  if (!res.ok) throw new Error('Failed to add comment')
  return res.json()
}

export async function fetchCitizenGrievances(aadhaarRef) {
  const res = await fetch(
    `${APIs.grievance}/v1/grievances?aadhaar=${encodeURIComponent(aadhaarRef)}`
  )
  if (!res.ok) return []
  return res.json()
}

export async function fetchConsents(aadhaarRef) {
  const res = await fetch(
    `${APIs.family}/v1/persons/${encodeURIComponent(aadhaarRef)}/consents`
  )
  if (!res.ok) return []
  return res.json()
}

export async function revokeConsent(aadhaarRef, consentId) {
  const res = await fetch(
    `${APIs.family}/v1/persons/${encodeURIComponent(aadhaarRef)}/consents/${consentId}/revoke`,
    { method: 'PATCH' }
  )
  if (!res.ok) throw new Error('Revoke failed')
  return res.json()
}

export async function restoreConsent(aadhaarRef, consentId) {
  const res = await fetch(
    `${APIs.family}/v1/persons/${encodeURIComponent(aadhaarRef)}/consents/${consentId}/restore`,
    { method: 'PATCH' }
  )
  if (!res.ok) throw new Error('Restore failed')
  return res.json()
}

export async function fetchDataExport(aadhaarRef) {
  const res = await fetch(
    `${APIs.family}/v1/persons/${encodeURIComponent(aadhaarRef)}/data-export`
  )
  if (!res.ok) throw new Error('Data export failed')
  return res.json()
}

export async function fetchNotifications(aadhaarRef) {
  const res = await fetch(
    `${APIs.notifications}/v1/notifications?aadhaar=${encodeURIComponent(aadhaarRef)}`
  )
  if (!res.ok) return []
  return res.json()
}

export async function markNotificationRead(id) {
  await fetch(`${APIs.notifications}/v1/notifications/${id}/read`, { method: 'PATCH' })
}

export function certificateDownloadUrl(engineRef) {
  return `${APIs.caste}/v1/applications/${encodeURIComponent(engineRef)}/certificate`
}

export async function submitClarification(aadhaarRef, citizenName, applicationRef, serviceName, question) {
  const res = await fetch(`${APIs.grievance}/v1/clarifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aadhaarRef, citizenName, applicationRef, serviceName, question }),
  })
  if (!res.ok) throw new Error('Failed to submit question')
  return res.json()
}

export async function fetchClarifications(aadhaarRef, applicationRef, direction) {
  const params = new URLSearchParams()
  if (applicationRef) {
    params.set('applicationRef', applicationRef)
  } else {
    params.set('aadhaar', aadhaarRef)
  }
  if (direction) params.set('direction', direction)
  const res = await fetch(`${APIs.grievance}/v1/clarifications?${params}`)
  if (!res.ok) return []
  return res.json()
}

export async function respondToInfoRequest(id, answer) {
  const res = await fetch(`${APIs.grievance}/v1/clarifications/${id}/respond`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (!res.ok) throw new Error('Failed to submit response')
  return res.json()
}

export function appRefsMatch(clarification, item) {
  const refs = new Set(
    [item.engineRef, item.applicationNo, item.live?.applicationNo, displayAppNo(item)].filter(Boolean)
  )
  return (
    refs.has(clarification.applicationRef) ||
    (clarification.displayRef && refs.has(clarification.displayRef))
  )
}

export function trackingMatchesApp(trackingId, item) {
  if (!trackingId) return false
  const refs = new Set(
    [item.engineRef, item.applicationNo, item.live?.applicationNo, displayAppNo(item)].filter(Boolean)
  )
  return refs.has(trackingId)
}

export function parseInfoRequestNotification(message) {
  const match = (message || '').match(
    /Officer (.+?) has requested additional information for your application .+?: (.+)$/s
  )
  return {
    officerName: match?.[1]?.trim() || 'Officer',
    query: match?.[2]?.trim() || message,
  }
}

export async function respondToInfoRequestByRef(payload) {
  const res = await fetch(`${APIs.grievance}/v1/clarifications/respond-by-ref`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || 'Failed to submit response')
  }
  return res.json()
}

export async function fetchFamilyBeneficiaries(familyId) {
  const res = await fetch(`${APIs.schemeEngine}/v1/beneficiaries/family/${familyId}`)
  if (!res.ok) return []
  return res.json()
}

export async function fetchFamily(familyId) {
  const res = await fetch(`${APIs.family}/v1/families/${familyId}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Session profile stored after login — family UUID stays internal; citizens see ration card. */
export async function buildCitizenSessionProfile(authData, person = {}) {
  const familyId = authData.familyId || (person.familyId ? String(person.familyId) : null)
  let rationCardNumber = null
  if (familyId) {
    try {
      const family = await fetchFamily(familyId)
      rationCardNumber = family?.rationCardNumber ?? null
    } catch { /* optional */ }
  }
  return {
    name: authData.name,
    aadhaarRef: authData.aadhaarRef,
    familyId,
    rationCardNumber,
    personId: person.id ? String(person.id) : null,
    dob: person.dob || null,
    gender: person.gender || null,
    occupation: person.occupation || null,
    annualIncome: person.annualIncome ?? null,
    casteCategory: person.casteCategory || null,
    mobile: person.mobile || null,
    educationLevel: person.educationLevel || null,
    maritalStatus: person.maritalStatus || null,
    employmentStatus: person.employmentStatus || null,
    village: person.village || null,
    taluka: person.taluka || null,
    district: person.district || null,
    onboardingCompleted: person.onboardingCompleted !== false,
  }
}

export async function completeOnboarding(personId, payload) {
  const res = await fetch(`${APIs.family}/v1/persons/${personId}/onboarding`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to complete onboarding')
  return res.json()
}

/** Fresh profile for the first-login onboarding screen — not localStorage alone */
export async function fetchOnboardingProfile(aadhaarRef) {
  const pr = await fetch(`${APIs.family}/v1/persons/search?aadhaar=${encodeURIComponent(aadhaarRef)}`)
  if (!pr.ok) throw new Error('Could not load profile')
  const payload = await pr.json()
  const persons = payload.results ?? payload
  const person = Array.isArray(persons) ? persons.find((p) => p.aadhaarRef === aadhaarRef) ?? persons[0] : null
  if (!person) throw new Error('Profile not found')

  let family = null
  if (person.familyId) {
    family = await fetchFamily(person.familyId).catch(() => null)
  }

  // Ration card records list each member's relationship to the head of household —
  // the head/primary member with a listed spouse (or a member who is themself the
  // spouse) is married. Parents, in-laws and children aren't inferred this way since
  // their own marital status isn't implied by someone else's spouse being on record.
  const members = family?.members ?? []
  const self = members.find((m) => String(m.id) === String(person.id))
  const hasSpouse = members.some((m) => m.relationshipToHead === 'SPOUSE')
  const primaryRelations = ['HEAD', 'OTHER']
  let rationMaritalStatus = null
  if (self?.relationshipToHead === 'SPOUSE') {
    rationMaritalStatus = 'MARRIED'
  } else if (primaryRelations.includes(self?.relationshipToHead) && hasSpouse) {
    rationMaritalStatus = 'MARRIED'
  }

  return {
    personId: String(person.id),
    familyId: person.familyId ? String(person.familyId) : null,
    name: person.name || null,
    aadhaarRef,
    dob: person.dob || null,
    gender: person.gender || null,
    mobile: person.mobile || null,
    address: family?.address ?? null,
    village: family?.village ?? person.village ?? null,
    taluka: family?.taluka ?? person.taluka ?? null,
    district: family?.district ?? person.district ?? null,
    rationCardNumber: family?.rationCardNumber ?? null,
    occupation: person.occupation || null,
    annualIncome: person.annualIncome ?? null,
    casteCategory: person.casteCategory || null,
    educationLevel: person.educationLevel || null,
    maritalStatus: rationMaritalStatus || person.maritalStatus || null,
    maritalStatusSource: rationMaritalStatus ? 'viaRation' : 'selfDeclared',
    employmentStatus: person.employmentStatus || null,
    onboardingCompleted: person.onboardingCompleted !== false,
  }
}

/** Locked profile for CAF — fresh from family registry, not localStorage alone */
export async function fetchCafCommonProfile(aadhaarRef, familyIdFromSession = null) {
  let person = null
  try {
    const pr = await fetch(
      `${APIs.family}/v1/persons/search?aadhaar=${encodeURIComponent(aadhaarRef)}`
    )
    if (pr.ok) {
      const payload = await pr.json()
      const persons = payload.results ?? payload
      if (Array.isArray(persons) && persons.length > 0) {
        person = persons.find((p) => p.aadhaarRef === aadhaarRef) ?? persons[0]
      }
    }
  } catch {
    /* registry unavailable — fall back to session fields */
  }

  const familyId = familyIdFromSession || (person?.familyId ? String(person.familyId) : null)
  let family = null
  let income = null
  if (familyId) {
    ;[family, income] = await Promise.all([
      fetchFamily(familyId).catch(() => null),
      fetchFamilyIncome(familyId).catch(() => null),
    ])
  }

  return {
    name: person?.name ?? null,
    aadhaarRef,
    familyId,
    personId: person?.id ? String(person.id) : null,
    district: person?.district ?? family?.district ?? null,
    taluka: person?.taluka ?? family?.taluka ?? null,
    village: person?.village ?? family?.village ?? null,
    state: family?.state ?? null,
    address: family?.address ?? null,
    rationCardNumber: family?.rationCardNumber ?? null,
    casteCategory: person?.casteCategory ?? null,
    annualIncome: person?.annualIncome ?? income?.totalAnnualIncome ?? null,
    mobile: person?.mobile ?? null,
    dob: person?.dob ?? null,
    gender: person?.gender ?? null,
  }
}

export async function fetchFamilyIncome(familyId) {
  const res = await fetch(`${APIs.family}/v1/families/${familyId}/income`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Guest eligibility scan (no login) — same rules as scheme engine identification. */
export async function fetchTalukasForDistrict(district) {
  if (!district?.trim()) return []
  const res = await fetch(`${APIs.family}/v1/geography/talukas?district=${encodeURIComponent(district.trim())}`)
  if (!res.ok) return []
  return res.json()
}

export async function fetchVillagesForTaluka(district, taluka) {
  if (!district?.trim() || !taluka?.trim()) return []
  const params = new URLSearchParams({ district: district.trim(), taluka: taluka.trim() })
  const res = await fetch(`${APIs.family}/v1/geography/villages?${params}`)
  if (!res.ok) return []
  return res.json()
}

const AI_BASE = import.meta.env.VITE_AI_BASE ?? '/ai-intelligence-service'

export async function extractVoiceProfile({ transcript, language, priorSlots }) {
  const res = await fetch(`${AI_BASE}/v1/speech/extract-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      language: language === 'gu' ? 'gu' : 'en',
      priorSlots: priorSlots || undefined,
    }),
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    const detail = data.detail
    const msg = typeof detail === 'string' ? detail : data.message || `Profile extraction failed (${res.status})`
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return data
}

export async function fetchSchemePublicDetails(schemeId) {
  const res = await fetch(`${APIs.schemeEngine}/v1/schemes/${encodeURIComponent(schemeId)}/public-details`)
  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    const err = new Error(data.message || `Scheme details unavailable (HTTP ${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export async function fetchActiveSchemes() {
  const res = await fetch(`${APIs.schemeEngine}/v1/schemes`)
  if (!res.ok) throw new Error(`Schemes unavailable (HTTP ${res.status})`)
  const data = await res.json()
  return Array.isArray(data) ? data.filter((s) => s.isActive !== false) : []
}

export async function fetchOfficeFilters() {
  const res = await fetch(`${APIs.schemeEngine}/v1/offices/filters`)
  if (!res.ok) throw new Error(`Office filters unavailable (HTTP ${res.status})`)
  return res.json()
}

/** @param {Record<string, unknown>} params */
export async function fetchNearbyOffices(params, signal) {
  const q = new URLSearchParams()
  if (params.schemeId) q.set('schemeId', String(params.schemeId))
  if (params.lat != null && params.lng != null) {
    q.set('lat', String(params.lat))
    q.set('lng', String(params.lng))
  }
  if (params.radiusKm != null) q.set('radiusKm', String(params.radiusKm))
  if (params.district) q.set('district', String(params.district))
  if (params.taluka) q.set('taluka', String(params.taluka))
  if (params.village) q.set('village', String(params.village))
  if (params.limit != null) q.set('limit', String(params.limit))
  const types = params.officeType
  if (Array.isArray(types)) {
    types.forEach((t) => q.append('officeType', t))
  }
  const res = await fetch(`${APIs.schemeEngine}/v1/offices/nearby?${q}`, { signal })
  if (!res.ok) {
    const err = new Error(`Nearby offices request failed (HTTP ${res.status})`)
    err.status = res.status
    throw err
  }
  return res.json()
}

export async function fetchGuestEligibility(payload) {
  const res = await fetch(`${APIs.schemeEngine}/v1/eligibility/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    throw new Error(data.message || `Eligibility check failed (HTTP ${res.status})`)
  }
  return data
}

export async function fetchFamilySchemeEligibility(familyId) {
  const res = await fetch(`${APIs.family}/v1/families/${familyId}/scheme-eligibility`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchSchemeApplicationCheck(schemeId, familyId, aadhaarRef, signal) {
  const params = new URLSearchParams({ familyId })
  if (aadhaarRef) params.set('aadhaar', aadhaarRef)
  const res = await fetch(
    `${APIs.schemeEngine}/v1/schemes/${encodeURIComponent(schemeId)}/application-check?${params}`,
    { signal }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Citizen document vault
export async function fetchCitizenDocuments(aadhaarRef) {
  const res = await fetch(`${APIs.family}/v1/documents?aadhaar=${encodeURIComponent(aadhaarRef)}`)
  if (!res.ok) return []
  return res.json()
}

/** Pull verified docs from UIDAI eKYC + DigiLocker (demo simulation) */
export async function syncTrustedDocuments(aadhaarRef, services = [], pensionType = null) {
  const res = await fetch(`${APIs.family}/v1/documents/sync-trusted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aadhaarRef, services, pensionType }),
  })
  if (!res.ok) throw new Error('Could not fetch documents from trusted sources')
  return res.json()
}

export async function uploadCitizenDocument(aadhaarRef, docType, file) {
  const encoded = await fileToBase64(file)
  const res = await fetch(`${APIs.family}/v1/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aadhaarRef, docType, fileName: encoded.name, fileType: encoded.type, fileData: encoded.data }),
  })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export async function fetchDocumentData(id) {
  const res = await fetch(`${APIs.family}/v1/documents/${id}/data`)
  if (!res.ok) throw new Error('Not found')
  return res.json()
}

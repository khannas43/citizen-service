import { getOfficerAccessToken } from './auth'
import { getLang, tr } from './i18n/lang'
import { localizeDepartments } from './i18n/departments.te'

// the service answers its refusals in the language the officer chose
const langHeader = () => ({ 'Accept-Language': getLang() })

const rel = (path, port) => (import.meta.env.DEV ? `http://localhost:${port}${path}` : path)
export const MDM_API = import.meta.env.VITE_MDM_API || rel('/mdm-service', 8100)

/** Call the MDM service as the signed-in officer. Throws an Error whose message is fit to show on screen. */
export async function mdm(path, { method = 'GET', body, params } = {}) {
  const qs = params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
    : ''
  let res
  try {
    res = await fetch(`${MDM_API}/api${path}${qs}`, {
      method,
      headers: { Authorization: `Bearer ${getOfficerAccessToken()}`, ...langHeader(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error(tr('The master data service cannot be reached right now.'))
  }
  if (res.status === 401) throw new Error(tr('Your session has expired. Sign in again.'))
  if (res.status === 403) throw new Error(tr('Your role does not allow this action.'))
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.detail || tr('The request failed ({status}).', { status: res.status }))
  return localizeDepartments(data)
}

/** Download a file the MDM service builds (for example a CSV report) as the signed-in officer. */
export async function mdmDownload(path, params, fallbackName = 'download.csv') {
  const qs = '?' + new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
  let res
  try {
    res = await fetch(`${MDM_API}/api${path}${qs}`, { headers: { Authorization: `Bearer ${getOfficerAccessToken()}`, ...langHeader() } })
  } catch {
    throw new Error(tr('The master data service cannot be reached right now.'))
  }
  if (!res.ok) {
    const d = await res.json().catch(() => null)
    throw new Error(d?.detail || tr('The download failed ({status}).', { status: res.status }))
  }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

/** Send a CSV file's text to the MDM service as the signed-in officer and return its JSON answer. */
export async function mdmUploadCsv(path, text, params) {
  const qs = '?' + new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
  let res
  try {
    res = await fetch(`${MDM_API}/api${path}${qs}`, { method: 'POST', headers: { Authorization: `Bearer ${getOfficerAccessToken()}`, ...langHeader(), 'Content-Type': 'text/csv' }, body: text })
  } catch {
    throw new Error(tr('The master data service cannot be reached right now.'))
  }
  if (res.status === 401) throw new Error(tr('Your session has expired. Sign in again.'))
  if (res.status === 403) throw new Error(tr('Your role does not allow this action.'))
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.detail || tr('The upload failed ({status}).', { status: res.status }))
  return data
}

// UC4: turning 18 and scholarship eligibility. Thin wrappers so screens and tests name what they do.
/** Admin only. Optionally pretend today is asOf (a date), for a demonstration. */
export const runDailyChecks = (asOf) => mdm('/x/jobs/daily', { method: 'POST', body: asOf ? { as_of: asOf } : {} })
export const lastDailyRun = () => mdm('/x/jobs/last')
/** Invite people about to turn 18 to apply. preview=true writes nothing and returns the count. */
export const inviteToApply = (personIds, preview, filter) => mdm('/x/turning-18/invite', {
  method: 'POST',
  body: {
    ...(personIds?.length ? { person_ids: personIds } : {}),
    ...(filter && Object.keys(filter).length ? { filter } : {}),
    preview: !!preview,
  },
})
export const eligibilityOutcomes = (days = 7) => mdm('/x/eligibility/outcomes', { params: { days } })

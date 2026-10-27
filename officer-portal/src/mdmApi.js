import { getOfficerAccessToken } from './auth'

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
      headers: { Authorization: `Bearer ${getOfficerAccessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('The master data service cannot be reached right now.')
  }
  if (res.status === 401) throw new Error('Your session has expired. Sign in again.')
  if (res.status === 403) throw new Error('Your role does not allow this action.')
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.detail || `The request failed (${res.status}).`)
  return data
}

import { unicodeCodePointCount } from './safe-object.js'

export const SERVICE_ID_MAX_CODE_POINTS = 256

const VERSION_QUERY_PATTERN = /^[1-9][0-9]*$/

export function admitServiceId(raw) {
  if (typeof raw !== 'string') {
    return { ok: false }
  }
  if (raw.length === 0 || raw.trim().length === 0) {
    return { ok: false }
  }
  if (raw !== raw.trim()) {
    return { ok: false }
  }
  if (unicodeCodePointCount(raw) > SERVICE_ID_MAX_CODE_POINTS) {
    return { ok: false }
  }
  return { ok: true, serviceId: raw }
}

export function admitVersionNumber(raw) {
  if (typeof raw !== 'number') {
    return { ok: false }
  }
  if (!Number.isSafeInteger(raw) || raw < 1 || raw > 2_147_483_647) {
    return { ok: false }
  }
  return { ok: true, version: raw }
}

export function admitVersionQuery(raw) {
  if (typeof raw !== 'string') {
    return { ok: false }
  }
  if (raw.length === 0 || raw.trim().length === 0) {
    return { ok: false }
  }
  if (raw !== raw.trim()) {
    return { ok: false }
  }
  if (!VERSION_QUERY_PATTERN.test(raw)) {
    return { ok: false }
  }
  const version = Number(raw)
  if (!Number.isSafeInteger(version) || version < 1 || version > 2_147_483_647) {
    return { ok: false }
  }
  if (String(version) !== raw) {
    return { ok: false }
  }
  return { ok: true, version }
}

export function encodeCoordinateQuery(serviceId, version) {
  const params = new URLSearchParams()
  params.set('serviceId', serviceId)
  params.set('version', String(version))
  return params.toString()
}

export function isUnitCVersion(value) {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647
  )
}

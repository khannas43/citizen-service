/** Unit C serviceId admission for published-form routes (FB-E3). */

export const SERVICE_ID_MAX_CODE_POINTS = 256

function unicodeCodePointCount(value) {
  let count = 0
  for (const codePoint of value) {
    void codePoint
    count += 1
  }
  return count
}

export function admitServiceId(raw) {
  if (typeof raw !== 'string') return { ok: false }
  if (raw.length === 0 || raw.trim().length === 0) return { ok: false }
  if (raw !== raw.trim()) return { ok: false }
  if (unicodeCodePointCount(raw) > SERVICE_ID_MAX_CODE_POINTS) return { ok: false }
  return { ok: true, serviceId: raw }
}

export function admitVersionNumber(raw) {
  if (typeof raw !== 'number') return { ok: false }
  if (!Number.isSafeInteger(raw) || raw < 1 || raw > 2_147_483_647) return { ok: false }
  return { ok: true, version: raw }
}

export function encodeServiceIdQuery(serviceId) {
  const params = new URLSearchParams()
  params.set('serviceId', serviceId)
  return params.toString()
}

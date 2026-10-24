/** Maximum Unicode code points for Unit C serviceId (FB-D7 / C0.1). */
export const SERVICE_ID_MAX_CODE_POINTS = 256

const VERSION_QUERY_PATTERN = /^[1-9][0-9]*$/

export type AdmitServiceIdResult =
  { readonly ok: true; readonly serviceId: string } | { readonly ok: false }

export type AdmitVersionQueryResult =
  { readonly ok: true; readonly version: number } | { readonly ok: false }

export type AdmitDraftCoordinatesResult =
  | { readonly ok: true; readonly serviceId: string; readonly version: number }
  | { readonly ok: false }

function unicodeCodePointCount(value: string): number {
  let count = 0
  for (const _ of value) {
    count += 1
  }
  return count
}

/**
 * Admit a Unit C lookup/query serviceId (FB-D7).
 * Never silently trims or coerces. Rejects blank, padded, or overlong values.
 */
export function admitServiceId(raw: unknown): AdmitServiceIdResult {
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

/**
 * Admit a Unit C version query string: exact [1-9][0-9]* in 1..2147483647.
 * Never coerces decimals, signs, exponents, padding, or whitespace.
 */
export function admitVersionQuery(raw: unknown): AdmitVersionQueryResult {
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
  // Reject values that Number accepted but are outside Java int after parse
  // (pattern already blocks leading zeros / non-digits).
  if (String(version) !== raw) {
    return { ok: false }
  }
  return { ok: true, version }
}

export function admitDraftCoordinates(
  serviceIdRaw: unknown,
  versionRaw: unknown,
): AdmitDraftCoordinatesResult {
  const serviceId = admitServiceId(serviceIdRaw)
  const version = admitVersionQuery(versionRaw)
  if (!serviceId.ok || !version.ok) {
    return { ok: false }
  }
  return { ok: true, serviceId: serviceId.serviceId, version: version.version }
}

/** Build `serviceId`/`version` query string via URLSearchParams (FB-D7). */
export function encodeDraftCoordinateQuery(serviceId: string, version: number): string {
  const params = new URLSearchParams()
  params.set('serviceId', serviceId)
  params.set('version', String(version))
  return params.toString()
}

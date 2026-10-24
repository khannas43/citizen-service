export const DEFAULT_VERSION_LIST_LIMIT = 50
export const MAX_VERSION_LIST_LIMIT = 100

export type AdmitVersionListLimitResult =
  { readonly ok: true; readonly limit: number } | { readonly ok: false }
export type AdmitVersionNumberResult =
  { readonly ok: true; readonly version: number } | { readonly ok: false }

function admitUnitCVersion(raw: unknown): AdmitVersionNumberResult {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1 || raw > 2_147_483_647) {
    return { ok: false }
  }
  return { ok: true, version: raw }
}

/** Admit Builder-owned list size without coercion. */
export function admitVersionListLimit(raw: unknown): AdmitVersionListLimitResult {
  if (
    typeof raw !== 'number' ||
    !Number.isSafeInteger(raw) ||
    raw < 1 ||
    raw > MAX_VERSION_LIST_LIMIT
  ) {
    return { ok: false }
  }
  return { ok: true, limit: raw }
}

/** Admit an optional Unit C list cursor. */
export function admitAfterVersion(raw: unknown): AdmitVersionNumberResult {
  return admitUnitCVersion(raw)
}

/** Admit a Unit C clone source version. */
export function admitSourceVersion(raw: unknown): AdmitVersionNumberResult {
  return admitUnitCVersion(raw)
}

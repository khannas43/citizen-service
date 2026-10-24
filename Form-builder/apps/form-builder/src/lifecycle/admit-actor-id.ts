/** Maximum Unicode code points for the Unit C lifecycle actorId. */
export const ACTOR_ID_MAX_CODE_POINTS = 256

export type AdmitActorIdResult =
  { readonly ok: true; readonly actorId: string } | { readonly ok: false }

function unicodeCodePointCount(value: string): number {
  let count = 0
  for (const _ of value) {
    count += 1
  }
  return count
}

/** Admit an exact, nonblank, unpadded actor identity without coercion. */
export function admitActorId(raw: unknown): AdmitActorIdResult {
  if (
    typeof raw !== 'string' ||
    raw.length === 0 ||
    raw.trim().length === 0 ||
    raw !== raw.trim()
  ) {
    return { ok: false }
  }
  if (unicodeCodePointCount(raw) > ACTOR_ID_MAX_CODE_POINTS) {
    return { ok: false }
  }
  return { ok: true, actorId: raw }
}

/** BuilderShell-facing alias; shell props obey the same lifecycle contract. */
export const admitHostLifecycleActorId = admitActorId

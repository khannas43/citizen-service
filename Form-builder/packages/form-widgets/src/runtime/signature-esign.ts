/**
 * Signature / eSign helpers (FB-A11).
 * Provisional host-injected boundary — not a claim of live eSign CBB integration.
 */

export interface SignatureESignValue {
  readonly contextRevision: string
  readonly signedArtefactRef: string
}

export function resolveESignContextRevision(
  value: string | undefined,
): { readonly ok: true; readonly contextRevision: string } | { readonly ok: false } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false }
  }
  return { ok: true, contextRevision: value.trim() }
}

export function isSafeSignedArtefactRef(
  signedArtefactRef: unknown,
  inputs: {
    readonly fieldId: string
    readonly contextRevision: string
  },
): boolean {
  if (typeof signedArtefactRef !== 'string') {
    return false
  }
  const trimmed = signedArtefactRef.trim()
  if (trimmed.length === 0) {
    return false
  }
  if (inputs.fieldId.length > 0 && trimmed === inputs.fieldId) {
    return false
  }
  if (inputs.contextRevision.length > 0 && trimmed === inputs.contextRevision) {
    return false
  }
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://')
  ) {
    return false
  }
  return true
}

export function acceptESignResult(
  result: unknown,
  request: {
    readonly fieldId: string
    readonly contextRevision: string
  },
): SignatureESignValue | { readonly cancelled: true } | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return null
  }
  const record = result as Record<string, unknown>
  if (record.contextRevision !== request.contextRevision) {
    return null
  }
  if (record.status === 'CANCELLED') {
    if ('signedArtefactRef' in record && record.signedArtefactRef !== undefined) {
      return null
    }
    return { cancelled: true }
  }
  if (record.status !== 'SIGNED') {
    return null
  }
  if (
    !isSafeSignedArtefactRef(record.signedArtefactRef, {
      fieldId: request.fieldId,
      contextRevision: request.contextRevision,
    })
  ) {
    return null
  }
  return {
    contextRevision: request.contextRevision,
    signedArtefactRef: (record.signedArtefactRef as string).trim(),
  }
}

const ALLOWED_KEYS = new Set(['contextRevision', 'signedArtefactRef'])

export type SignatureESignIncomingAssessment =
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'stale'; readonly value: SignatureESignValue }
  | { readonly kind: 'current'; readonly value: SignatureESignValue }

function isStructurallyValid(
  record: Record<string, unknown>,
  fieldId: string,
): SignatureESignValue | null {
  if (typeof record.contextRevision !== 'string' || record.contextRevision.trim().length === 0) {
    return null
  }
  const contextRevision = record.contextRevision.trim()
  if (
    !isSafeSignedArtefactRef(record.signedArtefactRef, {
      fieldId,
      contextRevision,
    })
  ) {
    return null
  }
  return {
    contextRevision,
    signedArtefactRef: (record.signedArtefactRef as string).trim(),
  }
}

/**
 * Presentation-validates external formData. Never rewrites or emits.
 * Stale = structurally valid signature for a different context revision.
 */
export function assessSignatureESignIncomingValue(
  value: unknown,
  contextRevision: string | undefined,
  fieldId = '',
): SignatureESignIncomingAssessment {
  if (value === undefined || value === null) {
    return { kind: 'unanswered' }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'malformed' }
  }
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { kind: 'malformed' }
    }
  }
  const structural = isStructurallyValid(record, fieldId)
  if (!structural) {
    return { kind: 'malformed' }
  }
  if (
    typeof contextRevision === 'string' &&
    contextRevision.length > 0 &&
    structural.contextRevision === contextRevision
  ) {
    return { kind: 'current', value: structural }
  }
  return { kind: 'stale', value: structural }
}

export function emitSignatureESignValue(
  value: SignatureESignValue,
  fieldId: string,
): SignatureESignValue | undefined {
  const revision = resolveESignContextRevision(value.contextRevision)
  if (!revision.ok) {
    return undefined
  }
  if (
    !isSafeSignedArtefactRef(value.signedArtefactRef, {
      fieldId,
      contextRevision: revision.contextRevision,
    })
  ) {
    return undefined
  }
  return {
    contextRevision: revision.contextRevision,
    signedArtefactRef: value.signedArtefactRef.trim(),
  }
}

import type { PrefillBinding } from '@citizen/form-contract'

import type { CafPrefillResolveResult } from './service-ports.js'

/**
 * Confidence values on bindings and adapter results must be finite and in [0, 1].
 * Unit C should reject out-of-range FormDefinition bindings; widgets fail safe.
 */
export function isValidConfidenceUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

/**
 * Prefill string must be non-blank (trimmed). Blank/whitespace never becomes CAF.
 */
export function isNonBlankPrefillValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Resolves the single CAF prefill binding for a fieldId from FormDefinition meta.
 * Zero matches → none. More than one → invalid (Unit C should reject; widgets fail safe).
 * confidenceMin must be finite and within 0..1 inclusive.
 */
export function resolvePrefillBindingForField(
  bindings: readonly PrefillBinding[] | undefined,
  fieldId: string,
):
  | { readonly status: 'none' }
  | { readonly status: 'ok'; readonly binding: PrefillBinding }
  | { readonly status: 'invalid' } {
  if (!bindings || bindings.length === 0) {
    return { status: 'none' }
  }
  const matches = bindings.filter((binding) => binding.fieldId === fieldId)
  if (matches.length === 0) {
    return { status: 'none' }
  }
  if (matches.length > 1) {
    return { status: 'invalid' }
  }
  const binding = matches[0]
  if (
    !binding ||
    typeof binding.cafAttribute !== 'string' ||
    binding.cafAttribute.trim().length === 0 ||
    !isValidConfidenceUnit(binding.confidenceMin)
  ) {
    return { status: 'invalid' }
  }
  return { status: 'ok', binding }
}

export type AcceptedCafPrefill = {
  readonly value: string
  readonly confidence: number
}

/**
 * Validates an adapter resolve result for CAF emission.
 * Invalid confidence, blank value, or found:false → not accepted (manual entry).
 */
export function acceptCafPrefillResult(
  result: CafPrefillResolveResult,
  confidenceMin: number,
): AcceptedCafPrefill | null {
  if (!isValidConfidenceUnit(confidenceMin)) {
    return null
  }
  if ('found' in result && result.found === false) {
    return null
  }
  if (!('value' in result) || !('confidence' in result)) {
    return null
  }
  if (!isNonBlankPrefillValue(result.value)) {
    return null
  }
  if (!isValidConfidenceUnit(result.confidence)) {
    return null
  }
  if (result.confidence < confidenceMin) {
    return null
  }
  return { value: result.value, confidence: result.confidence }
}

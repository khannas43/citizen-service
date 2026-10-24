/**
 * Validates host-returned opaque references so sensitive values never echo
 * into form data. Never log the reference or forbidden substrings.
 */

/**
 * Returns true when `reference` is a non-empty opaque string that does not
 * equal or contain any forbidden sensitive substring.
 */
export function isSafeOpaqueReference(
  reference: unknown,
  forbiddenSubstrings: readonly string[],
): boolean {
  if (typeof reference !== 'string') {
    return false
  }
  const trimmed = reference.trim()
  if (trimmed.length === 0) {
    return false
  }
  for (const forbidden of forbiddenSubstrings) {
    if (forbidden.length === 0) {
      continue
    }
    if (trimmed === forbidden || trimmed.includes(forbidden)) {
      return false
    }
  }
  return true
}

/** Challenge IDs must not echo the complete mobile number. */
export function isSafeChallengeId(challengeId: unknown, mobileNumber: string): boolean {
  return isSafeOpaqueReference(challengeId, [mobileNumber])
}

/**
 * Verification refs must not echo mobile, challengeId, or OTP, and must not
 * equal those values.
 */
export function isSafeVerificationRef(
  verificationRef: unknown,
  mobileNumber: string,
  challengeId: string,
  otp: string,
): boolean {
  return isSafeOpaqueReference(verificationRef, [mobileNumber, challengeId, otp])
}

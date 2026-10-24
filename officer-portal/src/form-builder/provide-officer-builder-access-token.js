/**
 * Request-time Builder access-token provider for officer-portal (FB-E5.4.3A).
 * Stable module-level function — do not wrap in inline arrows at the call site.
 */
import { admitOfficerAccessToken, getOfficerAccessToken } from '../auth.js'

/**
 * @returns {string | null}
 */
export function provideOfficerBuilderAccessToken() {
  const raw = getOfficerAccessToken()
  const admitted = admitOfficerAccessToken(raw)
  return admitted.ok ? admitted.token : null
}

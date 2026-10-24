/** Builder UX role admission for officer-portal (FB-E5.4.3A). UX gate only — FDS is authoritative. */

import {
  admitOfficerAccessToken,
  decodeJwtPayload,
  getOfficerAccessToken,
  isOfficerTokenValid,
} from '../auth.js'

/** Exact Keycloak realm roles that permit Builder navigation/route UX. */
export const BUILDER_UX_ROLES = Object.freeze([
  'FDS_DEFINITION_VALIDATOR',
  'FDS_DRAFT_CREATOR',
  'FDS_DEFINITION_READER',
  'FDS_DRAFT_EDITOR',
  'FDS_VERSION_READER',
  'FDS_DRAFT_CLONER',
  'FDS_FORM_SUBMITTER',
])

/**
 * @param {unknown} token
 * @returns {boolean}
 */
export function officerHasBuilderUxAccess(token = getOfficerAccessToken()) {
  try {
    const admitted = admitOfficerAccessToken(token)
    if (!admitted.ok) return false
    if (!isOfficerTokenValid(admitted.token)) return false
    const payload = decodeJwtPayload(admitted.token)
    if (!payload || typeof payload !== 'object') return false
    const roles = payload.realm_access?.roles
    if (!Array.isArray(roles)) return false
    return roles.some(
      (role) => typeof role === 'string' && BUILDER_UX_ROLES.includes(role),
    )
  } catch {
    return false
  }
}

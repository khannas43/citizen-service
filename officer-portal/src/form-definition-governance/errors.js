export class GovernanceAdapterError extends Error {
  constructor(code, message) {
    super(message ?? code)
    this.name = 'GovernanceAdapterError'
    this.code = code
  }
}

export const GOVERNANCE_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  STALE_REVISION: 'stale_revision',
  LIFECYCLE_CONFLICT: 'lifecycle_conflict',
  RESPONSE_REJECTED: 'response_rejected',
  FAILED: 'failed',
  INVALID_COORDINATES: 'invalid_coordinates',
  INVALID_REQUEST: 'invalid_request',
})

export function isAbortError(error) {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

export function mapHttpStatusToGovernanceError(status) {
  if (status === 401) return GOVERNANCE_ERROR_CODES.UNAUTHENTICATED
  if (status === 403) return GOVERNANCE_ERROR_CODES.FORBIDDEN
  if (status === 404) return GOVERNANCE_ERROR_CODES.NOT_FOUND
  if (status === 412) return GOVERNANCE_ERROR_CODES.STALE_REVISION
  if (status === 409) return GOVERNANCE_ERROR_CODES.LIFECYCLE_CONFLICT
  if (status === 400) return GOVERNANCE_ERROR_CODES.INVALID_REQUEST
  return GOVERNANCE_ERROR_CODES.FAILED
}

export const USER_MESSAGES = Object.freeze({
  unauthenticated: 'Authentication is required to access Form Definition governance.',
  forbidden: 'You do not have permission for this Form Definition governance action.',
  not_found: 'This Form Definition is no longer available for governance review.',
  stale_revision:
    'This definition changed since it was loaded. Reload the detail before retrying.',
  lifecycle_conflict: 'The definition lifecycle state changed. Refresh and try again.',
  response_rejected: 'The governance service returned a response that could not be admitted safely.',
  failed: 'The governance request failed. You can retry.',
  invalid_coordinates: 'The requested definition coordinates are invalid.',
  invalid_request: 'The governance request was rejected. You can retry.',
  definition_unsafe: 'Definition could not be admitted safely.',
  empty_queue: 'No submitted or approved Form Definitions are waiting for governance review.',
  technical_notice:
    'Technical Form Definition Governance — this is not a DST inbox. The Form Definition Service remains authoritative.',
})

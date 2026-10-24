export class PublishedFormError extends Error {
  constructor(code, message) {
    super(message ?? code)
    this.name = 'PublishedFormError'
    this.code = code
  }
}

export const PUBLISHED_FORM_ERROR_CODES = Object.freeze({
  NOT_FOUND: 'not_found',
  UNAVAILABLE: 'unavailable',
  UNSAFE: 'unsafe',
  INVALID_SERVICE_ID: 'invalid_service_id',
  FAILED: 'failed',
})

export function isAbortError(error) {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

export function mapHttpStatusToPublishedError(status) {
  if (status === 404) return PUBLISHED_FORM_ERROR_CODES.NOT_FOUND
  if (status === 400) return PUBLISHED_FORM_ERROR_CODES.INVALID_SERVICE_ID
  return PUBLISHED_FORM_ERROR_CODES.UNAVAILABLE
}

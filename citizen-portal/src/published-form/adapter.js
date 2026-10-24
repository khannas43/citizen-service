import { admitPublishedAdapterResult, admitPublishedLatestResponse } from './admit/admit-published.js'
import { admitServiceId, encodeServiceIdQuery } from './admit/admit-service-id.js'
import { parseJsonResponse } from './admit/http-json.js'
import {
  PUBLISHED_FORM_ERROR_CODES,
  PublishedFormError,
  isAbortError,
  mapHttpStatusToPublishedError,
} from './errors.js'

export const DEFAULT_FORM_DEFINITION_SERVICE_BASE_URL = '/form-definition-service'
export const DEFAULT_MAX_PUBLISHED_RESPONSE_BYTES = 512_000

export function resolveFormDefinitionServiceBaseUrl() {
  const fromEnv = import.meta.env?.VITE_FORM_DEFINITION_SERVICE_BASE_URL
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/+$/, '')
  }
  return DEFAULT_FORM_DEFINITION_SERVICE_BASE_URL
}

/**
 * @typedef {object} PublishedFormDefinitionAdapter
 * @property {(args: { serviceId: string, signal: AbortSignal }) => Promise<{ serviceId: string, version: number, definition: object }>} loadLatestPublished
 */

export function createHttpPublishedFormDefinitionAdapter(options = {}) {
  const baseUrl = (options.baseUrl ?? resolveFormDefinitionServiceBaseUrl()).replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_PUBLISHED_RESPONSE_BYTES
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new TypeError('maxResponseBytes must be a positive safe integer')
  }

  return {
    async loadLatestPublished({ serviceId, signal }) {
      const admittedId = admitServiceId(serviceId)
      if (!admittedId.ok) {
        throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.INVALID_SERVICE_ID)
      }
      const query = encodeServiceIdQuery(admittedId.serviceId)
      let response
      try {
        response = await fetchImpl(
          `${baseUrl}/api/v1/form-definitions/published/latest?${query}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal,
          },
        )
      } catch (error) {
        if (isAbortError(error) || signal.aborted) throw error
        throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.UNAVAILABLE)
      }
      if (response.status !== 200) {
        throw new PublishedFormError(mapHttpStatusToPublishedError(response.status))
      }
      // Intentionally ignore ETag — do not read, store, or surface it.
      let body
      try {
        body = await parseJsonResponse(response, maxResponseBytes, signal)
      } catch (error) {
        if (isAbortError(error) || signal.aborted) throw error
        throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.UNSAFE)
      }
      const admitted = admitPublishedLatestResponse(body, admittedId.serviceId)
      if (!admitted.ok) {
        throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.UNSAFE)
      }
      return admitted.snapshot
    },
  }
}

export function createAdmittingPublishedFormDefinitionAdapter(inner) {
  return {
    async loadLatestPublished(args) {
      const raw = await inner.loadLatestPublished(args)
      const admitted = admitPublishedAdapterResult(raw, args.serviceId)
      if (!admitted.ok) {
        throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.UNSAFE)
      }
      return admitted.snapshot
    },
  }
}

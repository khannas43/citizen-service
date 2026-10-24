import { admitServiceId, encodeCoordinateQuery, isUnitCVersion } from './admit/admit-coordinates.js'
import {
  admitDetailAdapterEnvelope,
  admitDetailDefinition,
  admitTransitionAdapterEnvelope,
  admitTransitionDefinition,
  buildTransitionBody,
} from './admit/admit-definition.js'
import { admitAdapterQueueEnvelope, admitGovernanceQueue } from './admit/admit-queue.js'
import { admitStrongEtag } from './admit/admit-strong-etag.js'
import { parseJsonResponse } from './admit/http-json.js'
import {
  GOVERNANCE_ERROR_CODES,
  GovernanceAdapterError,
  isAbortError,
  mapHttpStatusToGovernanceError,
} from './errors.js'
import { admitOfficerAccessToken, getOfficerAccessToken } from '../auth.js'

export const DEFAULT_FORM_DEFINITION_SERVICE_BASE_URL = '/form-definition-service'
export const DEFAULT_MAX_GOVERNANCE_RESPONSE_BYTES = 512_000

export function resolveFormDefinitionServiceBaseUrl() {
  const fromEnv = import.meta.env?.VITE_FORM_DEFINITION_SERVICE_BASE_URL
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/+$/, '')
  }
  return DEFAULT_FORM_DEFINITION_SERVICE_BASE_URL
}

function throwMapped(status) {
  throw new GovernanceAdapterError(mapHttpStatusToGovernanceError(status))
}

/**
 * Resolve Authorization header at request time (FB-E5.4.1).
 * @param {(() => string | null | Promise<string | null>)} accessTokenProvider
 * @returns {Promise<Record<string, string>>}
 */
async function resolveAuthHeaders(accessTokenProvider) {
  let raw
  try {
    raw = await Promise.resolve(accessTokenProvider())
  } catch {
    throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.UNAUTHENTICATED)
  }
  const admitted = admitOfficerAccessToken(raw)
  if (!admitted.ok) {
    throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.UNAUTHENTICATED)
  }
  return { Authorization: `Bearer ${admitted.token}` }
}

export function createHttpFormDefinitionGovernanceAdapter(options = {}) {
  const baseUrl = (options.baseUrl ?? resolveFormDefinitionServiceBaseUrl()).replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_GOVERNANCE_RESPONSE_BYTES
  const accessTokenProvider = options.accessTokenProvider ?? (() => getOfficerAccessToken())
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new TypeError('maxResponseBytes must be a positive safe integer')
  }
  if (typeof accessTokenProvider !== 'function') {
    throw new TypeError('accessTokenProvider must be a function')
  }

  return {
    async listQueue({ afterServiceId, afterVersion, limit, signal }) {
      const params = new URLSearchParams()
      if (afterServiceId !== undefined || afterVersion !== undefined) {
        const sid = admitServiceId(afterServiceId)
        if (!sid.ok || !isUnitCVersion(afterVersion)) {
          throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.INVALID_COORDINATES)
        }
        params.set('afterServiceId', sid.serviceId)
        params.set('afterVersion', String(afterVersion))
      }
      if (limit !== undefined) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.INVALID_REQUEST)
        }
        params.set('limit', String(limit))
      }
      const qs = params.toString()
      const url = `${baseUrl}/api/v1/form-definitions/governance/queue${qs ? `?${qs}` : ''}`
      const authHeaders = await resolveAuthHeaders(accessTokenProvider)
      let response
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/json', ...authHeaders },
          cache: 'no-store',
          signal,
        })
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error
        if (error instanceof GovernanceAdapterError) throw error
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.FAILED)
      }
      if (response.status !== 200) {
        throwMapped(response.status)
      }
      let body
      try {
        body = await parseJsonResponse(response, maxResponseBytes, signal)
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
      }
      const admitted = admitGovernanceQueue(body)
      if (!admitted.ok) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
      }
      return admitted.page
    },

    async loadDetail({ serviceId, version, signal }) {
      const sid = admitServiceId(serviceId)
      if (!sid.ok || !isUnitCVersion(version)) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.INVALID_COORDINATES)
      }
      const query = encodeCoordinateQuery(sid.serviceId, version)
      const authHeaders = await resolveAuthHeaders(accessTokenProvider)
      let response
      try {
        response = await fetchImpl(
          `${baseUrl}/api/v1/form-definitions/governance/detail?${query}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json', ...authHeaders },
            cache: 'no-store',
            signal,
          },
        )
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error
        if (error instanceof GovernanceAdapterError) throw error
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.FAILED)
      }
      if (response.status !== 200) {
        throwMapped(response.status)
      }
      let body
      try {
        body = await parseJsonResponse(response, maxResponseBytes, signal)
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
      }
      const admitted = admitDetailDefinition({
        body,
        etagHeader: response.headers.get('etag'),
        expectedServiceId: sid.serviceId,
        expectedVersion: version,
      })
      if (!admitted.ok) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
      }
      return admitted.snapshot
    },

    async transition({ serviceId, version, etag, targetStatus, signal }) {
      const sid = admitServiceId(serviceId)
      if (!sid.ok || !isUnitCVersion(version)) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.INVALID_COORDINATES)
      }
      const admittedEtag = admitStrongEtag(etag)
      if (!admittedEtag.ok) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.FAILED)
      }
      if (targetStatus !== 'approved' && targetStatus !== 'published') {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.INVALID_REQUEST)
      }
      const body = buildTransitionBody(targetStatus)
      if (Object.keys(body).length !== 1 || body.targetStatus !== targetStatus) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.INVALID_REQUEST)
      }
      const query = encodeCoordinateQuery(sid.serviceId, version)
      const authHeaders = await resolveAuthHeaders(accessTokenProvider)
      let response
      try {
        response = await fetchImpl(
          `${baseUrl}/api/v1/form-definitions/governance/lifecycle-transitions?${query}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'If-Match': admittedEtag.etag,
              ...authHeaders,
            },
            body: JSON.stringify(body),
            cache: 'no-store',
            signal,
          },
        )
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error
        if (error instanceof GovernanceAdapterError) throw error
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.FAILED)
      }
      if (response.status !== 200) {
        throwMapped(response.status)
      }
      let responseBody
      try {
        responseBody = await parseJsonResponse(response, maxResponseBytes, signal)
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
      }
      const admitted = admitTransitionDefinition({
        body: responseBody,
        etagHeader: response.headers.get('etag'),
        expectedServiceId: sid.serviceId,
        expectedVersion: version,
        expectedStatus: targetStatus,
      })
      if (!admitted.ok) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
      }
      return admitted.snapshot
    },
  }
}

/**
 * Wrap any injected adapter so results are cloned before inspection, then admitted.
 * No direct reads of adapter-owned members are performed before clone/admission.
 */
export function createAdmittingFormDefinitionGovernanceAdapter(inner) {
  return {
    async listQueue(args) {
      const raw = await inner.listQueue(args)
      const admitted = admitAdapterQueueEnvelope(raw)
      if (!admitted.ok) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
      }
      return admitted.page
    },
    async loadDetail(args) {
      const raw = await inner.loadDetail(args)
      const admitted = admitDetailAdapterEnvelope(raw, {
        expectedServiceId: args.serviceId,
        expectedVersion: args.version,
      })
      if (!admitted.ok) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
      }
      return admitted.snapshot
    },
    async transition(args) {
      const raw = await inner.transition(args)
      const admitted = admitTransitionAdapterEnvelope(raw, {
        expectedServiceId: args.serviceId,
        expectedVersion: args.version,
        expectedStatus: args.targetStatus,
      })
      if (!admitted.ok) {
        throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.RESPONSE_REJECTED)
      }
      return admitted.snapshot
    },
  }
}

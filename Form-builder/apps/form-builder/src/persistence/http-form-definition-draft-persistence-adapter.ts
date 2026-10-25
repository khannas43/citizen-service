import type { FormDefinition } from '@citizen/form-contract'

import {
  AccessTokenUnauthenticatedError,
  resolveAccessTokenAuthorizationHeaders,
  type AccessTokenProvider,
} from '../auth/index.js'
import {
  isJsonCompatibleContentType,
  readResponseBodyWithinByteLimit,
  resolveFormDefinitionServiceBaseUrl,
} from '../validation/index.js'
import { admitServiceId, encodeDraftCoordinateQuery } from './admit-draft-coordinates.js'
import { admitPersistenceSuccessResponse } from './admit-persistence-response.js'
import { admitStrongEtag } from './admit-strong-etag.js'
import {
  DraftPersistenceError,
  type FormDefinitionDraftPersistenceAdapter,
} from './form-definition-draft-persistence-adapter.js'
import { preparePersistenceRequest } from './prepare-persistence-request.js'

export const DEFAULT_MAX_PERSISTENCE_RESPONSE_BYTES = 512_000

export interface HttpFormDefinitionDraftPersistenceAdapterOptions {
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly maxResponseBytes?: number
  /** Host-owned request-time token provider (FB-E5.4.2A). No default. */
  readonly accessTokenProvider?: AccessTokenProvider | null
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function isUnitCVersion(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647
  )
}

function classifyHttpFailure(
  status: number,
  operation: 'create' | 'load' | 'replace',
): DraftPersistenceError {
  if (operation === 'create' && status === 409) {
    return new DraftPersistenceError('duplicate')
  }
  if (operation === 'load' && status === 404) {
    return new DraftPersistenceError('not_found')
  }
  if (operation === 'replace' && status === 412) {
    return new DraftPersistenceError('stale')
  }
  if (operation === 'replace' && status === 409) {
    return new DraftPersistenceError('not_editable')
  }
  if (status === 422) {
    return new DraftPersistenceError('validation_rejected')
  }
  return new DraftPersistenceError('failed')
}

function admitOutgoingDefinition(definition: FormDefinition): FormDefinition {
  const prepared = preparePersistenceRequest(definition)
  if (!prepared.ok) {
    throw new DraftPersistenceError('failed')
  }
  return prepared.definition
}

function admitLoadRequestCoordinates(
  serviceId: unknown,
  version: unknown,
): {
  readonly serviceId: string
  readonly version: number
} {
  const admittedServiceId = admitServiceId(serviceId)
  if (!admittedServiceId.ok || !isUnitCVersion(version)) {
    throw new DraftPersistenceError('invalid_coordinates')
  }
  return { serviceId: admittedServiceId.serviceId, version }
}

/**
 * Serialize a detached plain FormDefinition without invoking hostile getters/toJSON.
 */
function serializeDetachedDefinition(definition: FormDefinition): string {
  try {
    return JSON.stringify(definition)
  } catch {
    throw new DraftPersistenceError('failed')
  }
}

async function readAdmittedSnapshot(args: {
  readonly response: Response
  readonly expectedStatus: number
  readonly expectedServiceId: string
  readonly expectedVersion: number
  readonly maxResponseBytes: number
  readonly signal: AbortSignal
  readonly operation: 'create' | 'load' | 'replace'
}): Promise<{ readonly definition: FormDefinition; readonly etag: string }> {
  if (args.response.status !== args.expectedStatus) {
    throw classifyHttpFailure(args.response.status, args.operation)
  }

  if (!isJsonCompatibleContentType(args.response.headers.get('content-type'))) {
    throw new DraftPersistenceError('response_rejected')
  }

  const contentLengthHeader = args.response.headers.get('content-length')
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader)
    if (
      Number.isFinite(contentLength) &&
      contentLength >= 0 &&
      contentLength > args.maxResponseBytes
    ) {
      throw new DraftPersistenceError('response_rejected')
    }
  }

  let bytes: Uint8Array
  try {
    bytes = await readResponseBodyWithinByteLimit(args.response, args.maxResponseBytes, args.signal)
  } catch (error) {
    if (isAbortError(error) || args.signal.aborted) {
      throw error
    }
    throw new DraftPersistenceError('failed')
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new DraftPersistenceError('response_rejected')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new DraftPersistenceError('response_rejected')
  }

  const admitted = admitPersistenceSuccessResponse({
    body: parsed,
    etagHeader: args.response.headers.get('etag'),
    expectedServiceId: args.expectedServiceId,
    expectedVersion: args.expectedVersion,
  })
  if (!admitted.ok) {
    throw new DraftPersistenceError('response_rejected')
  }

  return { definition: admitted.definition, etag: admitted.etag }
}

/**
 * HTTP transport for Unit C draft create/load/replace (FB-D7 / D7.1 / E5.4.2A).
 * Admits requests before fetch. One request only; optional host-owned Bearer forwarding.
 */
export function createHttpFormDefinitionDraftPersistenceAdapter(
  options: HttpFormDefinitionDraftPersistenceAdapterOptions = {},
): FormDefinitionDraftPersistenceAdapter {
  const baseUrl = (options.baseUrl ?? resolveFormDefinitionServiceBaseUrl()).replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_PERSISTENCE_RESPONSE_BYTES
  const accessTokenProvider = options.accessTokenProvider ?? null
  if (!isPositiveSafeInteger(maxResponseBytes)) {
    throw new TypeError('maxResponseBytes must be a positive safe integer')
  }

  async function authHeaders(signal: AbortSignal): Promise<{ readonly Authorization: string }> {
    try {
      return await resolveAccessTokenAuthorizationHeaders(accessTokenProvider, signal)
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw error
      if (error instanceof AccessTokenUnauthenticatedError) {
        throw new DraftPersistenceError('unauthenticated')
      }
      throw new DraftPersistenceError('unauthenticated')
    }
  }

  return {
    async createDraft(request) {
      const detached = admitOutgoingDefinition(request.definition)
      const body = serializeDetachedDefinition(detached)
      const authorization = await authHeaders(request.signal)

      let response: Response
      try {
        response = await fetchImpl(`${baseUrl}/api/v1/form-definitions`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...authorization,
          },
          body,
          cache: 'no-store',
          signal: request.signal,
        })
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) {
          throw error
        }
        throw new DraftPersistenceError('failed')
      }

      return readAdmittedSnapshot({
        response,
        expectedStatus: 201,
        expectedServiceId: detached.serviceId,
        expectedVersion: detached.version,
        maxResponseBytes,
        signal: request.signal,
        operation: 'create',
      })
    },

    async loadDraft(request) {
      const coords = admitLoadRequestCoordinates(request.serviceId, request.version)
      const query = encodeDraftCoordinateQuery(coords.serviceId, coords.version)
      const authorization = await authHeaders(request.signal)
      let response: Response
      try {
        response = await fetchImpl(`${baseUrl}/api/v1/form-definitions?${query}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...authorization,
          },
          cache: 'no-store',
          signal: request.signal,
        })
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) {
          throw error
        }
        throw new DraftPersistenceError('failed')
      }

      return readAdmittedSnapshot({
        response,
        expectedStatus: 200,
        expectedServiceId: coords.serviceId,
        expectedVersion: coords.version,
        maxResponseBytes,
        signal: request.signal,
        operation: 'load',
      })
    },

    async replaceDraft(request) {
      const etagAdmitted = admitStrongEtag(request.etag)
      if (!etagAdmitted.ok) {
        throw new DraftPersistenceError('failed')
      }

      const coords = admitLoadRequestCoordinates(request.serviceId, request.version)
      const detached = admitOutgoingDefinition(request.definition)
      if (detached.serviceId !== coords.serviceId || detached.version !== coords.version) {
        throw new DraftPersistenceError('failed')
      }

      const query = encodeDraftCoordinateQuery(coords.serviceId, coords.version)
      const body = serializeDetachedDefinition(detached)
      const authorization = await authHeaders(request.signal)

      let response: Response
      try {
        response = await fetchImpl(`${baseUrl}/api/v1/form-definitions?${query}`, {
          method: 'PUT',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'If-Match': etagAdmitted.etag,
            ...authorization,
          },
          body,
          cache: 'no-store',
          signal: request.signal,
        })
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) {
          throw error
        }
        throw new DraftPersistenceError('failed')
      }

      return readAdmittedSnapshot({
        response,
        expectedStatus: 200,
        expectedServiceId: coords.serviceId,
        expectedVersion: coords.version,
        maxResponseBytes,
        signal: request.signal,
        operation: 'replace',
      })
    },
  }
}

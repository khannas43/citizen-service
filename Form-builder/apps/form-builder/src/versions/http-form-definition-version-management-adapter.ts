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
import {
  admitServiceId,
  encodeDraftCoordinateQuery,
} from '../persistence/admit-draft-coordinates.js'
import { admitStrongEtag } from '../persistence/admit-strong-etag.js'
import { admitCloneDraftResponse, admitCloneSourceReference } from './admit-clone-source.js'
import {
  admitAfterVersion,
  admitSourceVersion,
  admitVersionListLimit,
} from './admit-version-pagination.js'
import { admitVersionListResponse } from './admit-version-list-response.js'
import {
  VersionManagementError,
  type FormDefinitionVersionManagementAdapter,
} from './form-definition-version-management-adapter.js'

export const DEFAULT_MAX_VERSION_MANAGEMENT_RESPONSE_BYTES = 512_000

export interface HttpFormDefinitionVersionManagementAdapterOptions {
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

async function readJson(
  response: Response,
  maxResponseBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  if (!isJsonCompatibleContentType(response.headers.get('content-type'))) {
    throw new VersionManagementError('response_rejected')
  }
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxResponseBytes) {
    throw new VersionManagementError('response_rejected')
  }
  try {
    const bytes = await readResponseBodyWithinByteLimit(response, maxResponseBytes, signal)
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch (error) {
    if (isAbortError(error) || signal.aborted) throw error
    if (error instanceof VersionManagementError) throw error
    throw new VersionManagementError('response_rejected')
  }
}

function coords(
  serviceIdRaw: unknown,
  versionRaw: unknown,
): { serviceId: string; version: number } {
  const serviceId = admitServiceId(serviceIdRaw)
  const version = admitSourceVersion(versionRaw)
  if (!serviceId.ok || !version.ok) throw new VersionManagementError('invalid_coordinates')
  return { serviceId: serviceId.serviceId, version: version.version }
}

function cloneFailure(status: number): VersionManagementError {
  if (status === 412) return new VersionManagementError('stale_revision')
  if (status === 409) return new VersionManagementError('source_not_cloneable')
  if (status === 404) return new VersionManagementError('not_found')
  if (status === 400) return new VersionManagementError('invalid_request')
  return new VersionManagementError('failed')
}

/**
 * HTTP transport for version list / clone-source / clone (FB-D19 / E5.4.2A).
 * May forward Bearer; clone HTTP remains denyAll under FDS OIDC until E5.4.2B.
 */
export function createHttpFormDefinitionVersionManagementAdapter(
  options: HttpFormDefinitionVersionManagementAdapterOptions = {},
): FormDefinitionVersionManagementAdapter {
  const baseUrl = (options.baseUrl ?? resolveFormDefinitionServiceBaseUrl()).replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_VERSION_MANAGEMENT_RESPONSE_BYTES
  const accessTokenProvider = options.accessTokenProvider ?? null
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new TypeError('maxResponseBytes must be a positive safe integer')
  }

  async function authHeaders(signal: AbortSignal): Promise<{ readonly Authorization: string }> {
    try {
      return await resolveAccessTokenAuthorizationHeaders(accessTokenProvider, signal)
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw error
      if (error instanceof AccessTokenUnauthenticatedError) {
        throw new VersionManagementError('unauthenticated')
      }
      throw new VersionManagementError('unauthenticated')
    }
  }

  return {
    async listVersions(request) {
      const serviceId = admitServiceId(request.serviceId)
      const limit = admitVersionListLimit(request.limit)
      const after =
        request.afterVersion === undefined
          ? { ok: true as const, version: undefined }
          : admitAfterVersion(request.afterVersion)
      if (!serviceId.ok || !limit.ok || !after.ok)
        throw new VersionManagementError('invalid_coordinates')
      const query = new URLSearchParams({ serviceId: serviceId.serviceId })
      if (after.version !== undefined) query.set('afterVersion', String(after.version))
      query.set('limit', String(limit.limit))
      const authorization = await authHeaders(request.signal)
      let response: Response
      try {
        response = await fetchImpl(`${baseUrl}/api/v1/form-definitions/versions?${query}`, {
          method: 'GET',
          headers: { Accept: 'application/json', ...authorization },
          cache: 'no-store',
          signal: request.signal,
        })
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) throw error
        throw new VersionManagementError('failed')
      }
      if (response.status !== 200)
        throw response.status === 400
          ? new VersionManagementError('invalid_request')
          : new VersionManagementError('failed')
      const admitted = admitVersionListResponse({
        body: await readJson(response, maxResponseBytes, request.signal),
        expectedServiceId: serviceId.serviceId,
        afterVersion: after.version,
      })
      if (!admitted.ok) throw new VersionManagementError('response_rejected')
      return admitted.page
    },

    async prepareCloneSource(request) {
      const value = coords(request.serviceId, request.sourceVersion)
      const authorization = await authHeaders(request.signal)
      let response: Response
      try {
        response = await fetchImpl(
          `${baseUrl}/api/v1/form-definitions?${encodeDraftCoordinateQuery(value.serviceId, value.version)}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json', ...authorization },
            cache: 'no-store',
            signal: request.signal,
          },
        )
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) throw error
        throw new VersionManagementError('failed')
      }
      if (response.status === 404) throw new VersionManagementError('not_found')
      if (response.status !== 200) throw new VersionManagementError('failed')
      const admitted = admitCloneSourceReference({
        body: await readJson(response, maxResponseBytes, request.signal),
        etagHeader: response.headers.get('etag'),
        expectedServiceId: value.serviceId,
        expectedVersion: value.version,
      })
      if (!admitted.ok) throw new VersionManagementError(admitted.reason)
      return admitted.source
    },

    async cloneDraft(request) {
      const value = coords(request.serviceId, request.sourceVersion)
      const etag = admitStrongEtag(request.sourceEtag)
      if (!etag.ok) throw new VersionManagementError('invalid_request')
      // createdBy is ignored: actor comes from JWT under OIDC (FB-E5.4.2B).
      const query = new URLSearchParams({
        serviceId: value.serviceId,
        sourceVersion: String(value.version),
      })
      const authorization = await authHeaders(request.signal)
      let response: Response
      try {
        response = await fetchImpl(
          `${baseUrl}/api/v1/form-definitions/builder/drafts/from-version?${query}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'If-Match': etag.etag,
              ...authorization,
            },
            body: JSON.stringify({}),
            cache: 'no-store',
            signal: request.signal,
          },
        )
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) throw error
        throw new VersionManagementError('failed')
      }
      if (response.status !== 201) throw cloneFailure(response.status)
      const admitted = admitCloneDraftResponse({
        body: await readJson(response, maxResponseBytes, request.signal),
        etagHeader: response.headers.get('etag'),
        expectedServiceId: value.serviceId,
        sourceVersion: value.version,
      })
      if (!admitted.ok) throw new VersionManagementError('response_rejected')
      return { definition: admitted.definition, etag: admitted.etag }
    },
  }
}

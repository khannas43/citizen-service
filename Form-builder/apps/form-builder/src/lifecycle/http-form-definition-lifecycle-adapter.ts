import { resolveAccessTokenAuthorizationHeaders, type AccessTokenProvider } from '../auth/index.js'
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
import { admitLifecycleSuccessResponse } from './admit-lifecycle-response.js'
import {
  LifecycleError,
  type FormDefinitionLifecycleAdapter,
  type LifecycleSnapshot,
} from './form-definition-lifecycle-adapter.js'

export const DEFAULT_MAX_LIFECYCLE_RESPONSE_BYTES = 512_000

export interface HttpFormDefinitionLifecycleAdapterOptions {
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

function isUnitCVersion(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647
  )
}

async function readSnapshot(args: {
  readonly response: Response
  readonly serviceId: string
  readonly version: number
  readonly maxResponseBytes: number
  readonly signal: AbortSignal
}): Promise<LifecycleSnapshot> {
  if (args.response.status === 412) throw new LifecycleError('stale_revision')
  if (args.response.status === 409) throw new LifecycleError('transition_not_allowed')
  if (args.response.status === 400) throw new LifecycleError('invalid_request')
  if (args.response.status !== 200) throw new LifecycleError('failed')
  if (!isJsonCompatibleContentType(args.response.headers.get('content-type'))) {
    throw new LifecycleError('response_rejected')
  }
  const length = args.response.headers.get('content-length')
  if (
    length !== null &&
    Number.isFinite(Number(length)) &&
    Number(length) > args.maxResponseBytes
  ) {
    throw new LifecycleError('response_rejected')
  }
  let bytes: Uint8Array
  try {
    bytes = await readResponseBodyWithinByteLimit(args.response, args.maxResponseBytes, args.signal)
  } catch (error) {
    if (isAbortError(error) || args.signal.aborted) throw error
    throw new LifecycleError('failed')
  }
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw new LifecycleError('response_rejected')
  }
  const admitted = admitLifecycleSuccessResponse({
    body,
    etagHeader: args.response.headers.get('etag'),
    expectedServiceId: args.serviceId,
    expectedVersion: args.version,
  })
  if (!admitted.ok) throw new LifecycleError('response_rejected')
  return { definition: admitted.definition, etag: admitted.etag }
}

/**
 * HTTP transport for authenticated draft → submitted (FB-D18 / E5.4.2B).
 * Posts to `/builder/lifecycle-transitions` with `{ targetStatus: 'submitted' }` only.
 * Bearer from host `accessTokenProvider`; never sends client `actorId`.
 */
export function createHttpFormDefinitionLifecycleAdapter(
  options: HttpFormDefinitionLifecycleAdapterOptions = {},
): FormDefinitionLifecycleAdapter {
  const baseUrl = (options.baseUrl ?? resolveFormDefinitionServiceBaseUrl()).replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_LIFECYCLE_RESPONSE_BYTES
  const accessTokenProvider = options.accessTokenProvider ?? null
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new TypeError('maxResponseBytes must be a positive safe integer')
  }

  return {
    async submitDraft(request) {
      const serviceId = admitServiceId(request.serviceId)
      if (!serviceId.ok || !isUnitCVersion(request.version)) {
        throw new LifecycleError('invalid_coordinates')
      }
      // actorId is ignored: submittedBy comes from JWT under OIDC (FB-E5.4.2B).
      const etag = admitStrongEtag(request.etag)
      if (!etag.ok) throw new LifecycleError('failed')
      const query = encodeDraftCoordinateQuery(serviceId.serviceId, request.version)

      let authorization: { readonly Authorization: string }
      try {
        authorization = await resolveAccessTokenAuthorizationHeaders(
          accessTokenProvider,
          request.signal,
        )
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) throw error
        throw new LifecycleError('unauthenticated')
      }

      let response: Response
      try {
        response = await fetchImpl(
          `${baseUrl}/api/v1/form-definitions/builder/lifecycle-transitions?${query}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'If-Match': etag.etag,
              ...authorization,
            },
            body: JSON.stringify({ targetStatus: 'submitted' }),
            cache: 'no-store',
            signal: request.signal,
          },
        )
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) throw error
        throw new LifecycleError('failed')
      }
      return readSnapshot({
        response,
        serviceId: serviceId.serviceId,
        version: request.version,
        maxResponseBytes,
        signal: request.signal,
      })
    },
  }
}

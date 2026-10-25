import type { FormDefinition } from '@citizen/form-contract'

import {
  AccessTokenUnauthenticatedError,
  resolveAccessTokenAuthorizationHeaders,
  type AccessTokenProvider,
} from '../auth/index.js'
import { admitValidationResult } from './admit-validation-result.js'
import type { FormDefinitionValidationAdapter } from './form-definition-validation-adapter.js'
import { resolveFormDefinitionServiceBaseUrl } from './resolve-form-definition-service-base-url.js'

export const DEFAULT_MAX_VALIDATION_RESPONSE_BYTES = 512_000

export interface HttpFormDefinitionValidationAdapterOptions {
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

/** Accept application/json (with parameters) or application/*+json. */
export function isJsonCompatibleContentType(header: string | null): boolean {
  if (header === null) {
    return false
  }
  const mediaType = header.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (mediaType === 'application/json') {
    return true
  }
  return /^application\/[a-z0-9!#$&^_.+-]*\+json$/.test(mediaType)
}

function concatUint8Arrays(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array {
  const out = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function toAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
}

/**
 * Read response body with an actual UTF-8/byte-length cap (FB-D6.1 / D6.1.1).
 * Links AbortSignal to the active reader so pending reads reject promptly.
 * Cancels the stream reader immediately when the limit is exceeded.
 */
export async function readResponseBodyWithinByteLimit(
  response: Response,
  maxResponseBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) {
    throw toAbortError(signal)
  }

  const reader = response.body?.getReader?.()
  if (!reader) {
    let removeAbort: (() => void) | undefined
    let settled = false
    try {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const onAbort = () => {
          if (settled) {
            return
          }
          settled = true
          reject(toAbortError(signal))
        }
        signal.addEventListener('abort', onAbort)
        removeAbort = () => signal.removeEventListener('abort', onAbort)
        void response
          .arrayBuffer()
          .then((value) => {
            if (settled) {
              return
            }
            if (signal.aborted) {
              settled = true
              reject(toAbortError(signal))
              return
            }
            settled = true
            resolve(value)
          })
          .catch((error: unknown) => {
            if (settled) {
              return
            }
            settled = true
            if (signal.aborted || isAbortError(error)) {
              reject(isAbortError(error) ? error : toAbortError(signal))
              return
            }
            reject(error)
          })
      })
      if (buffer.byteLength > maxResponseBytes) {
        throw new Error('validation_response_too_large')
      }
      return new Uint8Array(buffer)
    } finally {
      removeAbort?.()
    }
  }

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  let cancelled = false
  const cancelReaderOnce = (): void => {
    if (cancelled) {
      return
    }
    cancelled = true
    void reader.cancel().catch(() => undefined)
  }

  let pendingReject: ((error: Error) => void) | null = null
  const onAbort = (): void => {
    cancelReaderOnce()
    const rejectPending = pendingReject
    pendingReject = null
    rejectPending?.(toAbortError(signal))
  }
  signal.addEventListener('abort', onAbort)

  try {
    for (;;) {
      if (signal.aborted) {
        cancelReaderOnce()
        throw toAbortError(signal)
      }

      const readPromise = reader.read()
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
          pendingReject = reject
          if (signal.aborted) {
            pendingReject = null
            cancelReaderOnce()
            reject(toAbortError(signal))
            return
          }
          void readPromise.then(
            (value) => {
              if (pendingReject !== reject) {
                return
              }
              pendingReject = null
              if (signal.aborted) {
                cancelReaderOnce()
                reject(toAbortError(signal))
                return
              }
              resolve(value)
            },
            (error: unknown) => {
              if (pendingReject !== reject) {
                return
              }
              pendingReject = null
              if (signal.aborted || isAbortError(error)) {
                cancelReaderOnce()
                reject(isAbortError(error) ? error : toAbortError(signal))
                return
              }
              reject(error instanceof Error ? error : new Error('validation_transport_failed'))
            },
          )
        })
      } catch (error) {
        if (isAbortError(error) || signal.aborted) {
          cancelReaderOnce()
          throw isAbortError(error) ? error : toAbortError(signal)
        }
        throw error
      }

      const { done, value } = result
      if (done) {
        break
      }
      if (!value || value.byteLength === 0) {
        continue
      }
      totalBytes += value.byteLength
      if (totalBytes > maxResponseBytes) {
        cancelReaderOnce()
        throw new Error('validation_response_too_large')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      cancelReaderOnce()
      throw isAbortError(error) ? error : toAbortError(signal)
    }
    if (error instanceof Error && error.message === 'validation_response_too_large') {
      throw error
    }
    throw new Error('validation_transport_failed')
  } finally {
    pendingReject = null
    signal.removeEventListener('abort', onAbort)
  }

  return concatUint8Arrays(chunks, totalBytes)
}

/**
 * HTTP transport for Unit C Form Definition validation (FB-D6 / D6.1 / E5.4.2A).
 * No retries, no login, no browser storage. Optional host-owned Bearer forwarding.
 */
export function createHttpFormDefinitionValidationAdapter(
  options: HttpFormDefinitionValidationAdapterOptions = {},
): FormDefinitionValidationAdapter {
  const baseUrl = (options.baseUrl ?? resolveFormDefinitionServiceBaseUrl()).replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_VALIDATION_RESPONSE_BYTES
  const accessTokenProvider = options.accessTokenProvider ?? null
  if (!isPositiveSafeInteger(maxResponseBytes)) {
    throw new TypeError('maxResponseBytes must be a positive safe integer')
  }

  return {
    async validateDefinition(request: {
      readonly definition: FormDefinition
      readonly signal: AbortSignal
    }) {
      let authHeaders: { readonly Authorization: string }
      try {
        authHeaders = await resolveAccessTokenAuthorizationHeaders(
          accessTokenProvider,
          request.signal,
        )
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) throw error
        if (error instanceof AccessTokenUnauthenticatedError) throw error
        throw new AccessTokenUnauthenticatedError()
      }

      const response = await fetchImpl(`${baseUrl}/api/v1/form-definitions/validation`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(request.definition),
        signal: request.signal,
      })

      if (response.status !== 200) {
        throw new Error('validation_transport_failed')
      }

      if (!isJsonCompatibleContentType(response.headers.get('content-type'))) {
        throw new Error('validation_content_type_rejected')
      }

      const contentLengthHeader = response.headers.get('content-length')
      if (contentLengthHeader !== null) {
        const contentLength = Number(contentLengthHeader)
        if (
          Number.isFinite(contentLength) &&
          contentLength >= 0 &&
          contentLength > maxResponseBytes
        ) {
          throw new Error('validation_response_too_large')
        }
      }

      let bytes: Uint8Array
      try {
        bytes = await readResponseBodyWithinByteLimit(response, maxResponseBytes, request.signal)
      } catch (error) {
        if (isAbortError(error) || request.signal.aborted) {
          throw error
        }
        if (error instanceof Error && error.message === 'validation_response_too_large') {
          throw error
        }
        throw new Error('validation_transport_failed')
      }

      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        throw new Error('validation_malformed_json')
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        throw new Error('validation_malformed_json')
      }

      const admitted = admitValidationResult(parsed)
      if (!admitted.ok) {
        throw new Error('validation_result_rejected')
      }
      return admitted.result
    },
  }
}

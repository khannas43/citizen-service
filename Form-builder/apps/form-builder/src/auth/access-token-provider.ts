/**
 * Host-owned access-token boundary for Builder HTTP adapters (FB-E5.4.2A).
 *
 * Package foundation only — no login UI, no token storage, no JWT decoding.
 * The host acquires/refreshes/logs out tokens; Builder only admits and forwards Bearer.
 */

/** Request-time token source. Return the raw credential (no `Bearer ` prefix). */
export type AccessTokenProvider = () => string | null | Promise<string | null>

/** Maximum admitted Bearer credential length (characters). */
export const ACCESS_TOKEN_MAX_CHARS = 8192

/**
 * Typed local unauthenticated failure. Message is always the stable code — never token content
 * or provider error text.
 */
export class AccessTokenUnauthenticatedError extends Error {
  readonly code = 'unauthenticated' as const

  constructor() {
    super('unauthenticated')
    this.name = 'AccessTokenUnauthenticatedError'
  }
}

export type AdmitAccessTokenResult =
  { readonly ok: true; readonly token: string } | { readonly ok: false }

/**
 * Admit a Bearer credential for outbound Builder HTTP only.
 * Rejects blank, padded, whitespace/control/CRLF, oversized values, and a supplied `Bearer ` prefix.
 * Does not decode or inspect JWT claims.
 */
export function admitAccessToken(token: unknown): AdmitAccessTokenResult {
  if (typeof token !== 'string') return { ok: false }
  if (token.length === 0 || token.length > ACCESS_TOKEN_MAX_CHARS) return { ok: false }
  if (token !== token.trim()) return { ok: false }
  if (/\s/.test(token)) return { ok: false }
  for (let i = 0; i < token.length; i += 1) {
    const code = token.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return { ok: false }
  }
  if (/^Bearer\s+/i.test(token)) return { ok: false }
  return { ok: true, token }
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function toAbortError(signal: AbortSignal): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError')
  }
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  void signal
  return error
}

/**
 * Resolve Authorization headers at request time.
 * Missing/unsafe provider results → {@link AccessTokenUnauthenticatedError} with zero fetch by caller.
 * Aborts when `signal` fires before provider resolution completes.
 */
export async function resolveAccessTokenAuthorizationHeaders(
  provider: AccessTokenProvider | null | undefined,
  signal?: AbortSignal,
): Promise<{ readonly Authorization: string }> {
  if (signal?.aborted) throw toAbortError(signal)
  if (typeof provider !== 'function') {
    throw new AccessTokenUnauthenticatedError()
  }

  let raw: string | null
  try {
    const pending = Promise.resolve(provider())
    if (signal == null) {
      raw = await pending
    } else {
      raw = await new Promise<string | null>((resolve, reject) => {
        const onAbort = () => {
          signal.removeEventListener('abort', onAbort)
          reject(toAbortError(signal))
        }
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
        pending.then(
          (value) => {
            signal.removeEventListener('abort', onAbort)
            if (signal.aborted) {
              reject(toAbortError(signal))
              return
            }
            resolve(value)
          },
          (error: unknown) => {
            signal.removeEventListener('abort', onAbort)
            if (signal.aborted || isAbortError(error)) {
              reject(isAbortError(error) ? error : toAbortError(signal))
              return
            }
            reject(error)
          },
        )
      })
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new AccessTokenUnauthenticatedError()
  }

  if (signal?.aborted) throw toAbortError(signal)

  const admitted = admitAccessToken(raw)
  if (!admitted.ok) throw new AccessTokenUnauthenticatedError()
  // Token is only held for this header object; callers must not log it.
  return { Authorization: `Bearer ${admitted.token}` }
}

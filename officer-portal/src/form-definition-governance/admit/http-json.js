export function isJsonCompatibleContentType(header) {
  if (header === null || header === undefined) {
    return false
  }
  if (typeof header !== 'string') {
    return false
  }
  const mediaType = header.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (mediaType === 'application/json') {
    return true
  }
  return /^application\/[a-z0-9!#$&^_.+-]*\+json$/.test(mediaType)
}

function concatUint8Arrays(chunks, totalBytes) {
  const out = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function toAbortError(signal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
}

/**
 * Read response body with an actual byte-length cap.
 */
export async function readResponseBodyWithinByteLimit(response, maxResponseBytes, signal) {
  if (signal.aborted) {
    throw toAbortError(signal)
  }

  const reader = response.body?.getReader?.()
  if (!reader) {
    let removeAbort
    let settled = false
    try {
      const buffer = await new Promise((resolve, reject) => {
        const onAbort = () => {
          if (settled) return
          settled = true
          reject(toAbortError(signal))
        }
        signal.addEventListener('abort', onAbort)
        removeAbort = () => signal.removeEventListener('abort', onAbort)
        void response
          .arrayBuffer()
          .then((value) => {
            if (settled) return
            if (signal.aborted) {
              settled = true
              reject(toAbortError(signal))
              return
            }
            settled = true
            resolve(value)
          })
          .catch((error) => {
            if (settled) return
            settled = true
            reject(error)
          })
      })
      if (buffer.byteLength > maxResponseBytes) {
        throw new Error('response_too_large')
      }
      return new Uint8Array(buffer)
    } finally {
      removeAbort?.()
    }
  }

  const chunks = []
  let total = 0
  const onAbort = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', onAbort)
  try {
    for (;;) {
      if (signal.aborted) {
        throw toAbortError(signal)
      }
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (!value) {
        continue
      }
      total += value.byteLength
      if (total > maxResponseBytes) {
        await reader.cancel().catch(() => {})
        throw new Error('response_too_large')
      }
      chunks.push(value)
    }
    return concatUint8Arrays(chunks, total)
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export async function parseJsonResponse(response, maxResponseBytes, signal) {
  if (!isJsonCompatibleContentType(response.headers.get('content-type'))) {
    throw new Error('invalid_content_type')
  }
  const length = response.headers.get('content-length')
  if (
    length !== null &&
    Number.isFinite(Number(length)) &&
    Number(length) > maxResponseBytes
  ) {
    throw new Error('response_too_large')
  }
  const bytes = await readResponseBodyWithinByteLimit(response, maxResponseBytes, signal)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('invalid_json')
  }
}

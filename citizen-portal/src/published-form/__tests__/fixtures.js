import { createE3AcceptancePublishedDefinition, E3_TECHNICAL_SERVICE_ID } from '../../acceptance/e3-published-definition.js'

export { createE3AcceptancePublishedDefinition, E3_TECHNICAL_SERVICE_ID }

/** Canonical injected adapter result: exact { serviceId, version, definition }. */
export function publishedAdapterResult(definition = createE3AcceptancePublishedDefinition()) {
  return {
    serviceId: definition.serviceId,
    version: definition.version,
    definition,
  }
}

export function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function createInjectedPublishedAdapter(impl) {
  return {
    loadLatestPublished: async (args) => impl(args),
  }
}

export function jsonResponse(body, { status = 200, headers = {}, etag } = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  const initHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  }
  if (etag !== undefined) {
    initHeaders.ETag = etag
  }
  return new Response(payload, { status, headers: initHeaders })
}

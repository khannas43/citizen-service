/**
 * Development-only Form Definition Service published/latest mock for FB-E3.
 * Not imported by production application code.
 *
 * Usage:
 *   node scripts/e3-published-form-mock.mjs
 *   VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET=http://127.0.0.1:18081 npm run dev
 */
import http from 'node:http'
import { URL } from 'node:url'
import { createE3AcceptancePublishedDefinition, E3_TECHNICAL_SERVICE_ID } from '../src/acceptance/e3-published-definition.js'

const PORT = Number(process.env.E3_MOCK_PORT || 18081)

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

function sendProblem(res, status, code, title) {
  sendJson(res, status, {
    type: 'about:blank',
    title,
    detail: title,
    code,
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const scenario = url.searchParams.get('scenario') || req.headers['x-e3-scenario']

  // Optional token-verification stub for browser scripts only (does not alter portal auth code).
  if (path === '/auth-service/v1/verify' || path === '/v1/verify') {
    return sendJson(res, 200, { ok: true, role: 'CITIZEN' })
  }

  if (path !== '/api/v1/form-definitions/published/latest') {
    return sendProblem(res, 404, 'not_found', 'Not found')
  }

  if (req.method !== 'GET') {
    return sendProblem(res, 405, 'method_not_allowed', 'Method not allowed')
  }

  const serviceId = url.searchParams.get('serviceId')

  if (scenario === '404' || serviceId === 'missing-service') {
    return sendProblem(res, 404, 'published_definition_not_found', 'Not found')
  }

  if (scenario === 'malformed') {
    return sendJson(res, 200, {
      serviceId,
      version: '1',
      status: 'published',
      jsonSchema: null,
    })
  }

  if (scenario === 'delayed') {
    const delayMs = Number(url.searchParams.get('delayMs') || 2500)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  if (!serviceId || serviceId !== E3_TECHNICAL_SERVICE_ID) {
    if (serviceId === 'svc-b') {
      return sendJson(
        res,
        200,
        createE3AcceptancePublishedDefinition({ serviceId: 'svc-b', version: 2 }),
        { ETag: '"ignored-by-citizen-portal"' },
      )
    }
    return sendProblem(res, 404, 'published_definition_not_found', 'Not found')
  }

  return sendJson(res, 200, createE3AcceptancePublishedDefinition(), {
    ETag: '"ignored-by-citizen-portal"',
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[e3-mock] listening on http://127.0.0.1:${PORT}`)
  console.log(`[e3-mock] published serviceId=${E3_TECHNICAL_SERVICE_ID}`)
})

/**
 * FB-E5.3A — test-only mock Form Definition Service upstream.
 * Records method/URI/selected header *presence* (not secret values) for assertions.
 * Deliberately returns a cacheable Cache-Control that the portal must override.
 */

import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 8080)
const KNOWN_ETAG = '"e53a-mock-etag-1"'

/** @type {object[]} */
const requests = []

function sanitizeRecord(req) {
  return {
    method: req.method,
    url: req.url,
    hasAuthorization: Boolean(req.headers.authorization),
    hasIfMatch: Boolean(req.headers['if-match']),
    contentLength: req.headers['content-length'] || null,
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

const server = createServer(async (req, res) => {
  const url = req.url || '/'

  if (url === '/__mock__/requests' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ requests }))
    return
  }

  if (url === '/__mock__/reset' && req.method === 'POST') {
    requests.length = 0
    res.writeHead(204)
    res.end()
    return
  }

  const body = await readBody(req)
  requests.push({ ...sanitizeRecord(req), bodyBytes: body.length })

  const baseHeaders = {
    ETag: KNOWN_ETAG,
    // Deliberately cacheable — portal proxy must force no-store.
    'Cache-Control': 'public, max-age=3600',
    'Content-Type': 'application/json',
  }

  // Allow status probes on allowlisted paths via ?mockStatus= or legacy /__status/ paths.
  const mockStatusMatch =
    url.match(/[?&]mockStatus=(\d{3})(?:&|$)/) || url.match(/\/__status\/(\d{3})/)
  const mockStatus = mockStatusMatch ? Number(mockStatusMatch[1]) : 0
  if (mockStatus === 401 || url.includes('/__status/401')) {
    res.writeHead(401, baseHeaders)
    res.end(JSON.stringify({ code: 'governance_unauthenticated' }))
    return
  }
  if (mockStatus === 403 || url.includes('/__status/403')) {
    res.writeHead(403, baseHeaders)
    res.end(JSON.stringify({ code: 'forbidden' }))
    return
  }
  if (mockStatus === 404 || url.includes('/__status/404')) {
    res.writeHead(404, baseHeaders)
    res.end(JSON.stringify({ code: 'not_found' }))
    return
  }
  if (mockStatus === 409 || url.includes('/__status/409')) {
    res.writeHead(409, baseHeaders)
    res.end(JSON.stringify({ code: 'conflict' }))
    return
  }
  if (mockStatus === 412 || url.includes('/__status/412')) {
    res.writeHead(412, baseHeaders)
    res.end(JSON.stringify({ code: 'precondition_failed' }))
    return
  }
  if (mockStatus === 422 || url.includes('/__status/422')) {
    res.writeHead(422, baseHeaders)
    res.end(JSON.stringify({ code: 'unprocessable' }))
    return
  }
  if (mockStatus === 428 || url.includes('/__status/428')) {
    res.writeHead(428, baseHeaders)
    res.end(JSON.stringify({ code: 'precondition_required' }))
    return
  }

  res.writeHead(200, baseHeaders)
  res.end(
    JSON.stringify({
      ok: true,
      path: url,
      method: req.method,
      bodyBytes: body.length,
    }),
  )
})

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`e53a-mock listening on ${PORT}\n`)
})

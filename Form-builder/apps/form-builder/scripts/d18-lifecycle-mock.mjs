#!/usr/bin/env node
/**
 * Deterministic Unit C-compatible draft persistence and lifecycle mock for FB-D18.
 * Listens on :8080 under /form-definition-service (Vite proxy target).
 */
import http from 'node:http'
import { Buffer } from 'node:buffer'

const PORT = Number(process.env.D18_MOCK_PORT || process.env.D7_MOCK_PORT || 8080)
const store = new Map()

function encodeEtag(revision) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(revision))
  return `"${buf.toString('base64url')}"`
}

function sendJson(res, status, body, etag) {
  const payload = JSON.stringify(body)
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  }
  if (etag) headers.ETag = etag
  res.writeHead(status, headers)
  res.end(payload)
}

function sendProblem(res, status, code) {
  sendJson(res, status, { code })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function keyOf(serviceId, version) {
  return `${serviceId}::${version}`
}

function isSubmitPayload(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).sort()
  if (keys.length !== 2 || keys[0] !== 'actorId' || keys[1] !== 'targetStatus') return false
  return (
    value.targetStatus === 'submitted' &&
    typeof value.actorId === 'string' &&
    value.actorId.length > 0 &&
    value.actorId === value.actorId.trim()
  )
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  if (!url.pathname.startsWith('/form-definition-service/')) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  const path = url.pathname.replace(/^\/form-definition-service/, '') || '/'

  if (req.method === 'POST' && path === '/api/v1/form-definitions/validation') {
    JSON.parse(await readBody(req))
    sendJson(res, 200, { valid: true, issues: [] })
    return
  }

  if (req.method === 'POST' && path === '/api/v1/form-definitions') {
    const definition = JSON.parse(await readBody(req))
    const key = keyOf(definition.serviceId, definition.version)
    if (store.has(key)) {
      sendProblem(res, 409, 'duplicate_form_definition')
      return
    }
    const etag = encodeEtag(1)
    store.set(key, { definition, revision: 1, etag })
    res.writeHead(201, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ETag: etag,
      Location: `/form-definition-service/api/v1/form-definitions?serviceId=${encodeURIComponent(definition.serviceId)}&version=${definition.version}`,
    })
    res.end(JSON.stringify(definition))
    return
  }

  if (req.method === 'POST' && path === '/api/v1/form-definitions/lifecycle-transitions') {
    const serviceId = url.searchParams.get('serviceId') || ''
    const version = Number(url.searchParams.get('version'))
    if (serviceId.endsWith('-force-fail')) {
      sendProblem(res, 500, 'forced_failure')
      return
    }
    const entry = store.get(keyOf(serviceId, version))
    if (!entry) {
      sendProblem(res, 404, 'form_definition_not_found')
      return
    }
    const ifMatch = req.headers['if-match']
    if (!ifMatch) {
      sendProblem(res, 428, 'if_match_required')
      return
    }
    if (
      serviceId.endsWith('-force-412') ||
      url.searchParams.get('force412') === '1' ||
      ifMatch !== entry.etag
    ) {
      sendProblem(res, 412, 'stale_revision')
      return
    }
    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch {
      sendProblem(res, 400, 'invalid_lifecycle_request')
      return
    }
    if (!isSubmitPayload(payload)) {
      sendProblem(res, 400, 'invalid_lifecycle_request')
      return
    }
    if (entry.definition.status === 'submitted') {
      sendProblem(res, 409, 'lifecycle_transition_not_allowed')
      return
    }
    const definition = {
      ...entry.definition,
      status: 'submitted',
      audit: { ...entry.definition.audit, submittedBy: payload.actorId },
    }
    const revision = entry.revision + 1
    const etag = encodeEtag(revision)
    store.set(keyOf(serviceId, version), { definition, revision, etag })
    sendJson(res, 200, definition, etag)
    return
  }

  if ((req.method === 'GET' || req.method === 'PUT') && path === '/api/v1/form-definitions') {
    const serviceId = url.searchParams.get('serviceId') || ''
    const version = Number(url.searchParams.get('version'))
    const key = keyOf(serviceId, version)
    const entry = store.get(key)
    if (req.method === 'GET') {
      if (!entry) {
        sendProblem(res, 404, 'form_definition_not_found')
        return
      }
      sendJson(res, 200, entry.definition, entry.etag)
      return
    }
    if (!entry) {
      sendProblem(res, 404, 'form_definition_not_found')
      return
    }
    const ifMatch = req.headers['if-match']
    if (!ifMatch) {
      sendProblem(res, 428, 'if_match_required')
      return
    }
    if (ifMatch !== entry.etag) {
      sendProblem(res, 412, 'stale_revision')
      return
    }
    const definition = JSON.parse(await readBody(req))
    const revision = entry.revision + 1
    const etag = encodeEtag(revision)
    store.set(key, { definition, revision, etag })
    sendJson(res, 200, definition, etag)
    return
  }

  res.writeHead(404)
  res.end('not found')
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`D18 lifecycle mock listening on http://127.0.0.1:${PORT}\n`)
})

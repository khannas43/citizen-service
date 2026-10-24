#!/usr/bin/env node
/**
 * Deterministic Unit C-compatible Form Definition draft mock for FB-D7 browser verify.
 * Listens on :8080 under /form-definition-service (Vite proxy target).
 */
import http from 'node:http'
import { Buffer } from 'node:buffer'

const PORT = Number(process.env.D7_MOCK_PORT || 8080)
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
  if (etag) {
    headers.ETag = etag
  }
  res.writeHead(status, headers)
  res.end(payload)
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  if (!url.pathname.startsWith('/form-definition-service/')) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  const path = url.pathname.replace(/^\/form-definition-service/, '') || '/'

  if (req.method === 'POST' && path === '/api/v1/form-definitions/validation') {
    const raw = await readBody(req)
    JSON.parse(raw)
    sendJson(res, 200, { valid: true, issues: [] })
    return
  }

  if (req.method === 'POST' && path === '/api/v1/form-definitions') {
    const definition = JSON.parse(await readBody(req))
    const key = keyOf(definition.serviceId, definition.version)
    if (store.has(key)) {
      res.writeHead(409, { 'Content-Type': 'application/problem+json' })
      res.end(JSON.stringify({ code: 'duplicate_form_definition' }))
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

  if ((req.method === 'GET' || req.method === 'PUT') && path === '/api/v1/form-definitions') {
    const serviceId = url.searchParams.get('serviceId') || ''
    const version = Number(url.searchParams.get('version'))
    const key = keyOf(serviceId, version)
    const entry = store.get(key)
    if (req.method === 'GET') {
      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'application/problem+json' })
        res.end(JSON.stringify({ code: 'form_definition_not_found' }))
        return
      }
      sendJson(res, 200, entry.definition, entry.etag)
      return
    }
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'application/problem+json' })
      res.end(JSON.stringify({ code: 'form_definition_not_found' }))
      return
    }
    const ifMatch = req.headers['if-match']
    if (!ifMatch) {
      res.writeHead(428, { 'Content-Type': 'application/problem+json' })
      res.end(JSON.stringify({ code: 'if_match_required' }))
      return
    }
    if (ifMatch !== entry.etag) {
      res.writeHead(412, { 'Content-Type': 'application/problem+json' })
      res.end(JSON.stringify({ code: 'stale_revision' }))
      return
    }
    const definition = JSON.parse(await readBody(req))
    const nextRevision = entry.revision + 1
    const etag = encodeEtag(nextRevision)
    store.set(key, { definition, revision: nextRevision, etag })
    sendJson(res, 200, definition, etag)
    return
  }

  res.writeHead(404)
  res.end('not found')
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`D7 persistence mock listening on http://127.0.0.1:${PORT}\n`)
})

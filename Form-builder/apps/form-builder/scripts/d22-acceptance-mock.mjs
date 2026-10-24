#!/usr/bin/env node
/**
 * FB-D22 consolidated Unit D acceptance mock.
 * Combines validation, draft POST/GET/PUT, lifecycle submit, version list,
 * exact published/retired GET, and clone-to-new-draft.
 *
 * Listens on :8080 under /form-definition-service (Vite proxy target).
 * Synthetic technical fixture only — no auth/DST claim.
 */
import http from 'node:http'
import { Buffer } from 'node:buffer'

const PORT = Number(process.env.D22_MOCK_PORT || process.env.D18_MOCK_PORT || 8080)
const DEMO_SERVICE = 'illustrative-builder-d0-preview'
const store = new Map()

function encodeEtag(revision) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(revision))
  return `"${buf.toString('base64url')}"`
}

function keyOf(serviceId, version) {
  return `${serviceId}::${version}`
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

function put(definition, revision = 1) {
  store.set(keyOf(definition.serviceId, definition.version), {
    definition,
    revision,
    etag: encodeEtag(revision),
  })
}

function seedImmutable(serviceId, version, status) {
  put(
    {
      serviceId,
      version,
      status,
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        additionalProperties: false,
        properties: {
          applicant_name: { type: 'string', maxLength: 200 },
        },
        required: ['applicant_name'],
      },
      uiSchema: {
        'ui:order': ['applicant_name'],
        applicant_name: { 'ui:widget': 'text-short' },
      },
      meta: {
        paletteProvenance: [{ fieldId: 'applicant_name', widgetType: 'text-short' }],
        bilingual: {
          labels: { applicant_name: { en: 'Name', gu: 'નામ' } },
          help: {},
          errors: {},
        },
        prefillBindings: [],
        integrationBindings: [],
        workflowBindings: [],
        progressiveSteps: [],
      },
      audit: { createdBy: 'd22-acceptance-mock', createdAt: '2026-07-26T00:00:00.000Z' },
    },
    1,
  )
}

// Published/retired clone sources for the illustrative Builder service.
seedImmutable(DEMO_SERVICE, 2, 'published')
seedImmutable(DEMO_SERVICE, 3, 'retired')

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

  if (req.method === 'GET' && path === '/api/v1/form-definitions/versions') {
    const serviceId = url.searchParams.get('serviceId') || ''
    const after = Number(url.searchParams.get('afterVersion') || 0)
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)))
    const all = [...store.values()]
      .map((entry) => entry.definition)
      .filter((item) => item.serviceId === serviceId)
      .sort((a, b) => a.version - b.version)
    const items = all
      .filter((item) => item.version > after)
      .slice(0, limit)
      .map(({ version, status }) => ({ version, status }))
    const hasMore = all.some((item) => item.version > (items.at(-1)?.version ?? after))
    sendJson(res, 200, {
      serviceId,
      items,
      ...(hasMore ? { nextAfterVersion: items.at(-1).version } : {}),
    })
    return
  }

  if (req.method === 'POST' && path === '/api/v1/form-definitions/drafts/from-version') {
    const serviceId = url.searchParams.get('serviceId') || ''
    const sourceVersion = Number(url.searchParams.get('sourceVersion'))
    const source = store.get(keyOf(serviceId, sourceVersion))
    if (!source) {
      sendProblem(res, 404, 'form_definition_not_found')
      return
    }
    if (!['published', 'retired'].includes(source.definition.status)) {
      sendProblem(res, 409, 'source_not_cloneable')
      return
    }
    if (req.headers['if-match'] !== source.etag) {
      sendProblem(res, 412, 'stale_revision')
      return
    }
    const payload = JSON.parse(await readBody(req))
    if (!payload || typeof payload.createdBy !== 'string' || !payload.createdBy.trim()) {
      sendProblem(res, 400, 'invalid_request')
      return
    }
    const nextVersion =
      Math.max(
        0,
        ...[...store.values()]
          .filter((entry) => entry.definition.serviceId === serviceId)
          .map((entry) => entry.definition.version),
      ) + 1
    const cloned = {
      ...source.definition,
      version: nextVersion,
      status: 'draft',
      audit: {
        createdBy: payload.createdBy,
        createdAt: '2026-07-26T12:00:00.000Z',
      },
    }
    put(cloned, 1)
    sendJson(res, 201, cloned, encodeEtag(1))
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
    if (ifMatch !== entry.etag) {
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
    if (entry.definition.status !== 'draft') {
      sendProblem(res, 409, 'lifecycle_transition_not_allowed')
      return
    }
    const definition = {
      ...entry.definition,
      status: 'submitted',
      audit: {
        createdBy: entry.definition.audit.createdBy,
        createdAt: entry.definition.audit.createdAt,
        submittedBy: payload.actorId,
      },
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
  process.stdout.write(`D22 acceptance mock listening on http://127.0.0.1:${PORT}\n`)
})

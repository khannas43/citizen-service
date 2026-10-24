#!/usr/bin/env node
/**
 * Deterministic FB-D19 mock: draft persistence plus immutable-version listing
 * and cloning. Listens on :8080 under /form-definition-service.
 */
import http from 'node:http'
import { Buffer } from 'node:buffer'

const PORT = Number(process.env.D19_MOCK_PORT || 8080)
const store = new Map()
const keyOf = (serviceId, version) => `${serviceId}::${version}`
const etag = (revision) => {
  const bytes = Buffer.alloc(8)
  bytes.writeBigUInt64BE(BigInt(revision))
  return `"${bytes.toString('base64url')}"`
}
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
const send = (res, status, body, revision) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    ...(revision ? { ETag: etag(revision) } : {}),
  })
  res.end(payload)
}
const problem = (res, status, code) => send(res, status, { code })

function definition(serviceId, version, status) {
  return {
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
    audit: { createdBy: 'd19-mock', createdAt: '2026-07-26T00:00:00Z' },
  }
}
function put(definitionValue, revision = 1) {
  store.set(keyOf(definitionValue.serviceId, definitionValue.version), {
    definition: definitionValue,
    revision,
  })
}
put(definition('d19-demo-service', 1, 'published'))
put(definition('d19-demo-service', 2, 'retired'))

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const path = url.pathname.replace(/^\/form-definition-service/, '')
  if (!url.pathname.startsWith('/form-definition-service/')) return problem(res, 404, 'not_found')
  if (req.method === 'POST' && path === '/api/v1/form-definitions/validation')
    return send(res, 200, { valid: true, issues: [] })

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
    return send(res, 200, {
      serviceId,
      items,
      ...(hasMore ? { nextAfterVersion: items.at(-1).version } : {}),
    })
  }

  if (req.method === 'POST' && path === '/api/v1/form-definitions/drafts/from-version') {
    const serviceId = url.searchParams.get('serviceId') || ''
    const sourceVersion = Number(url.searchParams.get('sourceVersion'))
    const source = store.get(keyOf(serviceId, sourceVersion))
    if (!source) return problem(res, 404, 'form_definition_not_found')
    if (!['published', 'retired'].includes(source.definition.status))
      return problem(res, 409, 'source_not_cloneable')
    if (req.headers['if-match'] !== etag(source.revision))
      return problem(res, 412, 'stale_revision')
    const payload = JSON.parse(await readBody(req))
    if (!payload || typeof payload.createdBy !== 'string' || !payload.createdBy.trim())
      return problem(res, 400, 'invalid_request')
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
        createdAt: '2026-07-26T12:00:00Z',
      },
    }
    put(cloned)
    return send(res, 201, cloned, 1)
  }

  if (req.method === 'POST' && path === '/api/v1/form-definitions') {
    const value = JSON.parse(await readBody(req))
    if (store.has(keyOf(value.serviceId, value.version)))
      return problem(res, 409, 'duplicate_form_definition')
    put(value)
    return send(res, 201, value, 1)
  }

  if ((req.method === 'GET' || req.method === 'PUT') && path === '/api/v1/form-definitions') {
    const serviceId = url.searchParams.get('serviceId') || ''
    const version = Number(url.searchParams.get('version'))
    const entry = store.get(keyOf(serviceId, version))
    if (!entry) return problem(res, 404, 'form_definition_not_found')
    if (req.method === 'GET') return send(res, 200, entry.definition, entry.revision)
    if (req.headers['if-match'] !== etag(entry.revision)) return problem(res, 412, 'stale_revision')
    const value = JSON.parse(await readBody(req))
    put(value, entry.revision + 1)
    return send(res, 200, value, entry.revision + 1)
  }
  return problem(res, 404, 'not_found')
})
server.listen(PORT, '127.0.0.1', () =>
  console.log(`D19 versions mock listening on http://127.0.0.1:${PORT}`),
)

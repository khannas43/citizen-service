/**
 * Development-only Form Definition Service governance mock for FB-E2.
 * Not imported by production application code.
 *
 * Usage:
 *   node scripts/e2-governance-mock.mjs
 *   VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET=http://127.0.0.1:18080 npm run dev
 */
import http from 'node:http'
import { URL } from 'node:url'

const PORT = Number(process.env.E2_MOCK_PORT || 18080)

function encodeBytesToBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

function formatEtag(revision) {
  const bytes = Buffer.alloc(8)
  bytes.writeBigUInt64BE(BigInt(revision))
  return `"${encodeBytesToBase64Url(bytes)}"`
}

function definition({ serviceId, version, status, revision }) {
  return {
    serviceId,
    version,
    status,
    jsonSchema: {
      type: 'object',
      properties: { applicantName: { type: 'string' } },
      additionalProperties: false,
    },
    uiSchema: {
      'ui:order': ['applicantName'],
      applicantName: { 'ui:widget': 'text' },
    },
    meta: {
      paletteProvenance: [{ fieldId: 'applicantName', widgetType: 'text-input' }],
      bilingual: {
        labels: { applicantName: { en: 'Applicant name', gu: 'અરજદારનું નામ' } },
        help: {},
        errors: {},
      },
      prefillBindings: [{ fieldId: 'applicantName', cafAttribute: 'fullName', confidenceMin: 0.8 }],
      integrationBindings: [],
      workflowBindings: [{ fieldId: 'applicantName', stage: 'review' }],
      progressiveSteps: [
        {
          stepId: 'step-1',
          labelEn: 'Basics',
          labelGu: 'મૂળભૂત',
          fieldIds: ['applicantName'],
        },
      ],
    },
    audit: {
      createdBy: 'author-1',
      createdAt: '2026-07-20T10:00:00.000Z',
      submittedBy: 'author-1',
      ...(status === 'approved' || status === 'published' ? { approvedBy: 'tech-officer' } : {}),
      ...(status === 'published' ? { publishedAt: '2026-07-22T10:00:00.000Z' } : {}),
    },
    _revision: revision,
  }
}

const store = new Map([
  [
    `svc-demo\0${1}`,
    definition({ serviceId: 'svc-demo', version: 1, status: 'submitted', revision: 1 }),
  ],
])

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > 64_000) {
        reject(new Error('too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const scenario = url.searchParams.get('scenario') || req.headers['x-e2-scenario']

  if (scenario === '401' || url.searchParams.get('force') === '401') {
    return sendProblem(res, 401, 'governance_unauthenticated', 'Unauthenticated')
  }
  if (scenario === '403' || url.searchParams.get('force') === '403') {
    return sendProblem(res, 403, 'governance_forbidden', 'Forbidden')
  }

  if (req.method === 'GET' && path === '/api/v1/form-definitions/governance/queue') {
    if (scenario === 'malformed') {
      return sendJson(res, 200, { items: [{ serviceId: 'x' }] })
    }
    const items = [...store.values()]
      .filter((row) => row.status === 'submitted' || row.status === 'approved')
      .map(({ serviceId, version, status }) => ({ serviceId, version, status }))
      .sort((a, b) =>
        a.serviceId === b.serviceId ? a.version - b.version : a.serviceId.localeCompare(b.serviceId),
      )
    return sendJson(res, 200, { items })
  }

  if (req.method === 'GET' && path === '/api/v1/form-definitions/governance/detail') {
    const serviceId = url.searchParams.get('serviceId')
    const version = Number(url.searchParams.get('version'))
    const row = store.get(`${serviceId}\0${version}`)
    if (!row || (row.status !== 'submitted' && row.status !== 'approved')) {
      return sendProblem(res, 404, 'governance_definition_not_found', 'Not found')
    }
    const { _revision, ...body } = row
    return sendJson(res, 200, body, { ETag: formatEtag(_revision) })
  }

  if (req.method === 'POST' && path === '/api/v1/form-definitions/governance/lifecycle-transitions') {
    if (scenario === '412' || url.searchParams.get('force') === '412') {
      return sendProblem(res, 412, 'stale_revision', 'Stale')
    }
    const serviceId = url.searchParams.get('serviceId')
    const version = Number(url.searchParams.get('version'))
    const ifMatch = req.headers['if-match']
    const row = store.get(`${serviceId}\0${version}`)
    if (!row) {
      return sendProblem(res, 404, 'governance_definition_not_found', 'Not found')
    }
    let raw
    try {
      raw = await readBody(req)
    } catch {
      return sendProblem(res, 400, 'malformed_json', 'Bad body')
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return sendProblem(res, 400, 'malformed_json', 'Bad JSON')
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 ||
      (parsed.targetStatus !== 'approved' && parsed.targetStatus !== 'published') ||
      Object.prototype.hasOwnProperty.call(parsed, 'actorId')
    ) {
      return sendProblem(res, 400, 'invalid_governance_transition_request', 'Invalid body')
    }
    const expected = formatEtag(row._revision)
    if (ifMatch !== expected) {
      return sendProblem(res, 412, 'stale_revision', 'Stale')
    }
    const nextStatus = parsed.targetStatus
    if (row.status === 'submitted' && nextStatus !== 'approved') {
      return sendProblem(res, 409, 'lifecycle_transition_not_allowed', 'Conflict')
    }
    if (row.status === 'approved' && nextStatus !== 'published') {
      return sendProblem(res, 409, 'lifecycle_transition_not_allowed', 'Conflict')
    }
    const next = definition({
      serviceId,
      version,
      status: nextStatus,
      revision: row._revision + 1,
    })
    store.set(`${serviceId}\0${version}`, next)
    const { _revision, ...body } = next
    return sendJson(res, 200, body, { ETag: formatEtag(_revision) })
  }

  sendProblem(res, 404, 'not_found', 'Not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[e2-governance-mock] listening on http://127.0.0.1:${PORT}`)
  console.log('Proxy with VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET=http://127.0.0.1:' + PORT)
})

#!/usr/bin/env node
/**
 * FB-E5.3A.1 — offline portal nginx FDS least-privilege proxy verifier.
 *
 * Mounts each portal's real nginx.conf + FDS location template into temporary
 * nginx:alpine containers. Never builds/pushes portal images. Never calls
 * Helm/kubectl. Single-flight cleanup removes only run-scoped resources.
 */

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CITIZEN_REQUIRED_LOCATIONS,
  OFFICER_REQUIRED_LOCATIONS,
  assertExistingRoutesPreserved,
  assertLocalReject,
  assertLocationTemplateContract,
  assertProxyResponse,
  assertUpstreamDidNotReceive,
  assertUpstreamObservation,
} from './e5.3a-nginx-proxy-assert.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FORM_BUILDER = join(here, '..')
const ROOT = join(FORM_BUILDER, '..')
const OFFICER = join(ROOT, 'officer-portal')
const CITIZEN = join(ROOT, 'citizen-portal')
const MOCK_SCRIPT = join(here, 'e5.3a-mock-fds-upstream.mjs')

const runId = randomBytes(4).toString('hex')
const ids = {
  network: `dg20-e53a-net-${runId}`,
  mock: `dg20-e53a-mock-${runId}`,
  officer: `dg20-e53a-ngx-officer-${runId}`,
  citizen: `dg20-e53a-ngx-citizen-${runId}`,
  alt: `dg20-e53a-ngx-alt-${runId}`,
}

const KNOWN_ETAG = '"e53a-mock-etag-1"'

let cleanupPromise = null

function log(msg) {
  process.stdout.write(`[e5.3a-portal-proxy-verify] ${msg}\n`)
}

function fail(msg) {
  process.stderr.write(`[e5.3a-portal-proxy-verify] FAIL: ${msg}\n`)
}

function dockerEnv() {
  const env = { ...process.env }
  const rd = join(homedir(), '.rd/docker.sock')
  if (!env.DOCKER_HOST && existsSync(rd)) {
    env.DOCKER_HOST = `unix://${rd}`
  }
  return env
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...dockerEnv(), ...(options.env || {}) },
    timeout: options.timeoutMs ?? 120_000,
  })
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

function docker(args, options = {}) {
  const result = run('docker', args, options)
  if (!options.allowFail && result.code !== 0) {
    throw new Error(
      `docker ${args.join(' ')} failed: ${(result.stderr || result.stdout).slice(0, 800)}`,
    )
  }
  return result
}

function hasCors(headers) {
  for (const name of headers.keys()) {
    if (name.toLowerCase().startsWith('access-control-')) return true
  }
  return false
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise
  cleanupPromise = (async () => {
    log('Cleaning run-scoped containers/network…')
    for (const name of [ids.alt, ids.officer, ids.citizen, ids.mock]) {
      docker(['rm', '-f', name], { allowFail: true })
    }
    docker(['network', 'rm', ids.network], { allowFail: true })
  })()
  return cleanupPromise
}

function requireDocker() {
  const info = docker(['info'], { allowFail: true })
  if (info.code !== 0) {
    throw new Error(
      'Docker unavailable. Set DOCKER_HOST=unix://$HOME/.rd/docker.sock and start Rancher Desktop.',
    )
  }
  log('Docker daemon available')
}

function staticPortalChecks() {
  for (const [label, root, required, portal] of [
    ['officer', OFFICER, OFFICER_REQUIRED_LOCATIONS, 'officer'],
    ['citizen', CITIZEN, CITIZEN_REQUIRED_LOCATIONS, 'citizen'],
  ]) {
    const conf = readFileSync(join(root, 'nginx.conf'), 'utf8')
    const template = readFileSync(
      join(root, 'nginx/form-definition-service-location.conf.template'),
      'utf8',
    )
    const routes = assertExistingRoutesPreserved(conf, required)
    if (!routes.ok) {
      throw new Error(`${label} nginx.conf regressions:\n- ${routes.failures.join('\n- ')}`)
    }
    const tmpl = assertLocationTemplateContract(template, portal)
    if (!tmpl.ok) throw new Error(`${label} template contract:\n- ${tmpl.failures.join('\n- ')}`)
    log(`${label}: existing routes + least-privilege template contract OK`)
  }
}

function writeSpaFixture(dir) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>e53a-spa</title><p>spa-ok</p>\n')
}

const CLUSTER_DNS_ALIASES = [
  'mock-fds',
  'form-definition-service',
  'keycloak.egov.svc.cluster.local',
  'auth-service.egov.svc.cluster.local',
  'caste-certificate-service.egov.svc.cluster.local',
  'marriage-certificate-service.egov.svc.cluster.local',
  'pension-service.egov.svc.cluster.local',
  'family-member-service.egov.svc.cluster.local',
  'scheme-application-service.egov.svc.cluster.local',
  'family-registry-service.egov.svc.cluster.local',
  'scheme-engine-service.egov.svc.cluster.local',
  'grievance-service.egov.svc.cluster.local',
  'notifications-service.egov.svc.cluster.local',
  'chatbot-service.egov.svc.cluster.local',
  'ai-intelligence-service.egov.svc.cluster.local',
]

function startMock() {
  docker(['network', 'create', ids.network])
  const aliasArgs = CLUSTER_DNS_ALIASES.flatMap((alias) => ['--network-alias', alias])
  docker([
    'run',
    '-d',
    '--name',
    ids.mock,
    '--network',
    ids.network,
    ...aliasArgs,
    '-v',
    `${MOCK_SCRIPT}:/mock.mjs:ro`,
    'node:20-alpine',
    'node',
    '/mock.mjs',
  ])
}

async function waitMockReady() {
  for (let i = 0; i < 30; i += 1) {
    const probe = docker(
      [
        'run',
        '--rm',
        '--network',
        ids.network,
        'curlimages/curl:8.5.0',
        '-fsS',
        'http://mock-fds:8080/form-definition-service/actuator/health',
      ],
      { allowFail: true, timeoutMs: 30_000 },
    )
    if (probe.code === 0) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('mock FDS upstream did not become ready')
}

function startNginx({ name, portalRoot, upstream, htmlDir }) {
  docker([
    'run',
    '-d',
    '--name',
    name,
    '--network',
    ids.network,
    '-e',
    `FORM_DEFINITION_SERVICE_UPSTREAM=${upstream}`,
    '-e',
    'NGINX_ENVSUBST_FILTER=^FORM_DEFINITION_SERVICE_UPSTREAM$',
    '-e',
    'NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/form-definition-service',
    '--tmpfs',
    '/etc/nginx/form-definition-service:rw,mode=0755',
    '-v',
    `${join(portalRoot, 'nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`,
    '-v',
    `${join(portalRoot, 'nginx/form-definition-service-location.conf.template')}:/etc/nginx/templates/form-definition-service-location.conf.template:ro`,
    '-v',
    `${htmlDir}:/usr/share/nginx/html:ro`,
    'nginx:alpine',
  ])
}

async function nginxTest(name) {
  let last = { code: 1, stdout: '', stderr: '' }
  for (let i = 0; i < 30; i += 1) {
    const running = docker(['inspect', '-f', '{{.State.Running}} {{.State.Status}}', name], {
      allowFail: true,
    })
    last = docker(['exec', name, 'nginx', '-t'], { allowFail: true })
    if (last.code === 0) {
      log(`${name}: nginx -t OK`)
      return
    }
    if (i === 5 || i === 15) {
      const logs = docker(['logs', '--tail', '40', name], { allowFail: true })
      log(
        `${name}: waiting for nginx -t (state=${(running.stdout || '').trim()} err=${(
          last.stderr ||
          last.stdout ||
          ''
        ).slice(0, 200)})`,
      )
      log(`${name}: logs ${(logs.stderr || logs.stdout || '').slice(0, 400)}`)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`${name}: nginx -t failed: ${(last.stderr || last.stdout || '').slice(0, 800)}`)
}

async function proxyFetch(containerName, pathAndQuery, init = {}) {
  const method = init.method || 'GET'
  const args = [
    'run',
    '--rm',
    '--network',
    ids.network,
    'curlimages/curl:8.5.0',
    '-sS',
    '-D',
    '-',
    '-o',
    '/tmp/body',
    '-X',
    method,
    `http://${containerName}${pathAndQuery}`,
  ]
  if (init.headers) {
    for (const [k, v] of Object.entries(init.headers)) {
      args.push('-H', `${k}: ${v}`)
    }
  }
  if (init.body != null) {
    args.push('--data-binary', init.body)
  }
  args.push('-w', '\n__STATUS__%{http_code}')
  const result = docker(args, { timeoutMs: 60_000 })
  if (result.code !== 0) {
    throw new Error(`curl via ${containerName} failed: ${result.stderr || result.stdout}`)
  }
  const raw = result.stdout
  const statusMatch = raw.match(/__STATUS__(\d+)\s*$/)
  const status = statusMatch ? Number(statusMatch[1]) : 0
  const headerBlock = raw.replace(/\n__STATUS__\d+\s*$/, '').split('\r\n\r\n')[0] || ''
  const headers = new Headers()
  for (const line of headerBlock.split(/\r?\n/).slice(1)) {
    const idx = line.indexOf(':')
    if (idx > 0) headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
  }
  return { status, headers, corsPresent: hasCors(headers) }
}

async function mockRequests() {
  const result = docker(
    [
      'run',
      '--rm',
      '--network',
      ids.network,
      'curlimages/curl:8.5.0',
      '-fsS',
      'http://mock-fds:8080/__mock__/requests',
    ],
    { timeoutMs: 30_000 },
  )
  return JSON.parse(result.stdout).requests
}

async function resetMock() {
  docker(
    [
      'run',
      '--rm',
      '--network',
      ids.network,
      'curlimages/curl:8.5.0',
      '-fsS',
      '-X',
      'POST',
      'http://mock-fds:8080/__mock__/reset',
    ],
    { allowFail: true, timeoutMs: 30_000 },
  )
}

/** Paths that must remain locally blocked for every portal. */
const COMMON_BLOCKED_PATHS = [
  '/form-definition-service/actuator/health',
  '/form-definition-service/api/v1/form-definitions/drafts/from-version?serviceId=x&sourceVersion=1',
  '/form-definition-service/api/v1/form-definitions/lifecycle-transitions?serviceId=x&version=1',
]

/** Additional citizen denials (Builder + governance + draft APIs). */
const CITIZEN_EXTRA_BLOCKED = [
  '/form-definition-service/api/v1/form-definitions/validation',
  '/form-definition-service/api/v1/form-definitions?serviceId=x&version=1',
  '/form-definition-service/api/v1/form-definitions/versions?serviceId=x',
  '/form-definition-service/api/v1/form-definitions/builder/drafts/from-version?serviceId=x&sourceVersion=1',
  '/form-definition-service/api/v1/form-definitions/builder/lifecycle-transitions?serviceId=x&version=1',
  '/form-definition-service/api/v1/form-definitions/governance/queue',
  '/form-definition-service/api/v1/form-definitions/governance/detail',
]

async function assertBlocked(containerName, label, extraBlocked = []) {
  for (const path of [...COMMON_BLOCKED_PATHS, ...extraBlocked]) {
    const res = await proxyFetch(containerName, path, {
      method:
        path.includes('/validation') ||
        path.includes('lifecycle-transitions') ||
        path.includes('/drafts/from-version')
          ? 'POST'
          : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body:
        path.includes('/validation') ||
        path.includes('lifecycle-transitions') ||
        path.includes('/drafts/from-version')
          ? '{"probe":true}'
          : undefined,
    })
    const a = assertLocalReject(res, 403)
    if (!a.ok) {
      throw new Error(`${label} blocked ${path}:\n- ${a.failures.join('\n- ')}`)
    }
  }
}

async function runCitizenSuite(containerName) {
  await resetMock()
  const label = 'citizen'

  const getPath =
    '/form-definition-service/api/v1/form-definitions/published/latest?serviceId=unit-e-demo'
  const getRes = await proxyFetch(containerName, getPath, {
    headers: { Authorization: 'Bearer e53a-test-token' },
  })
  const getAssert = assertProxyResponse(getRes, { expectStatus: 200, expectEtag: KNOWN_ETAG })
  if (!getAssert.ok)
    throw new Error(`${label} GET published/latest:\n- ${getAssert.failures.join('\n- ')}`)

  const wrongMethod = await proxyFetch(containerName, getPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  const methodAssert = assertLocalReject(wrongMethod, 405)
  if (!methodAssert.ok) {
    throw new Error(`${label} wrong method:\n- ${methodAssert.failures.join('\n- ')}`)
  }

  await assertBlocked(containerName, label, CITIZEN_EXTRA_BLOCKED)

  for (const code of [401, 403, 412]) {
    const res = await proxyFetch(
      containerName,
      `/form-definition-service/api/v1/form-definitions/published/latest?serviceId=x&mockStatus=${code}`,
    )
    const a = assertProxyResponse(res, { expectStatus: code, expectEtag: KNOWN_ETAG })
    if (!a.ok) throw new Error(`${label} status ${code}:\n- ${a.failures.join('\n- ')}`)
  }

  const spa = await proxyFetch(containerName, '/does-not-exist-spa-fallback')
  if (spa.status !== 200) {
    throw new Error(`${label}: SPA fallback expected 200, got ${spa.status}`)
  }

  const observed = await mockRequests()
  const getObs = observed.find(
    (r) => r.method === 'GET' && String(r.url).includes('published/latest'),
  )
  const getObsAssert = assertUpstreamObservation(getObs, {
    method: 'GET',
    urlIncludes: 'serviceId=unit-e-demo',
    expectAuth: true,
  })
  if (!getObsAssert.ok) {
    throw new Error(`${label} upstream GET:\n- ${getObsAssert.failures.join('\n- ')}`)
  }
  const noLeak = assertUpstreamDidNotReceive(observed, [
    '/validation',
    '/actuator/',
    '/governance/',
    '/lifecycle-transitions',
    '/drafts/',
    '/versions',
  ])
  if (!noLeak.ok) {
    throw new Error(`${label} upstream leak:\n- ${noLeak.failures.join('\n- ')}`)
  }

  log(`${label}: allowlist/deny/method/header/status/cache/SPA contract OK`)
}

async function runOfficerSuite(containerName) {
  await resetMock()
  const label = 'officer'

  const queuePath =
    '/form-definition-service/api/v1/form-definitions/governance/queue?afterServiceId=a&limit=10'
  const queueRes = await proxyFetch(containerName, queuePath, {
    headers: { Authorization: 'Bearer e53a-test-token' },
  })
  const queueAssert = assertProxyResponse(queueRes, { expectStatus: 200, expectEtag: KNOWN_ETAG })
  if (!queueAssert.ok) {
    throw new Error(`${label} GET queue:\n- ${queueAssert.failures.join('\n- ')}`)
  }

  const detailPath =
    '/form-definition-service/api/v1/form-definitions/governance/detail?serviceId=demo&version=1'
  const detailRes = await proxyFetch(containerName, detailPath, {
    headers: { Authorization: 'Bearer e53a-test-token' },
  })
  const detailAssert = assertProxyResponse(detailRes, { expectStatus: 200, expectEtag: KNOWN_ETAG })
  if (!detailAssert.ok) {
    throw new Error(`${label} GET detail:\n- ${detailAssert.failures.join('\n- ')}`)
  }

  const lifePath =
    '/form-definition-service/api/v1/form-definitions/governance/lifecycle-transitions?serviceId=demo&version=1'
  const lifeRes = await proxyFetch(containerName, lifePath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer e53a-test-token',
      'If-Match': '"rev-1"',
    },
    body: '{"targetStatus":"approved"}',
  })
  const lifeAssert = assertProxyResponse(lifeRes, { expectStatus: 200, expectEtag: KNOWN_ETAG })
  if (!lifeAssert.ok) {
    throw new Error(`${label} POST lifecycle:\n- ${lifeAssert.failures.join('\n- ')}`)
  }

  // FB-E5.4.3B — authenticated Builder allowlist
  const builderProbes = [
    {
      name: 'validation',
      path: '/form-definition-service/api/v1/form-definitions/validation',
      method: 'POST',
      body: '{"probe":true}',
      headers: { Authorization: 'Bearer e53a-test-token', 'Content-Type': 'application/json' },
    },
    {
      name: 'draft-create',
      path: '/form-definition-service/api/v1/form-definitions',
      method: 'POST',
      body: '{"serviceId":"demo"}',
      headers: { Authorization: 'Bearer e53a-test-token', 'Content-Type': 'application/json' },
    },
    {
      name: 'exact-get',
      path: '/form-definition-service/api/v1/form-definitions?serviceId=demo&version=1',
      method: 'GET',
      headers: { Authorization: 'Bearer e53a-test-token' },
    },
    {
      name: 'draft-replace',
      path: '/form-definition-service/api/v1/form-definitions?serviceId=demo&version=1',
      method: 'PUT',
      body: '{"serviceId":"demo","version":1}',
      headers: {
        Authorization: 'Bearer e53a-test-token',
        'Content-Type': 'application/json',
        'If-Match': '"rev-2"',
      },
    },
    {
      name: 'versions',
      path: '/form-definition-service/api/v1/form-definitions/versions?serviceId=demo&limit=10',
      method: 'GET',
      headers: { Authorization: 'Bearer e53a-test-token' },
    },
    {
      name: 'builder-clone',
      path: '/form-definition-service/api/v1/form-definitions/builder/drafts/from-version?serviceId=demo&sourceVersion=1',
      method: 'POST',
      body: '{}',
      headers: {
        Authorization: 'Bearer e53a-test-token',
        'Content-Type': 'application/json',
        'If-Match': '"rev-3"',
      },
    },
    {
      name: 'builder-submit',
      path: '/form-definition-service/api/v1/form-definitions/builder/lifecycle-transitions?serviceId=demo&version=1',
      method: 'POST',
      body: '{"targetStatus":"submitted"}',
      headers: {
        Authorization: 'Bearer e53a-test-token',
        'Content-Type': 'application/json',
        'If-Match': '"rev-4"',
      },
    },
  ]

  for (const probe of builderProbes) {
    const res = await proxyFetch(containerName, probe.path, {
      method: probe.method,
      headers: probe.headers,
      body: probe.body,
    })
    const a = assertProxyResponse(res, { expectStatus: 200, expectEtag: KNOWN_ETAG })
    if (!a.ok) {
      throw new Error(`${label} Builder ${probe.name}:\n- ${a.failures.join('\n- ')}`)
    }
  }

  const wrongQueueMethod = await proxyFetch(containerName, queuePath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!assertLocalReject(wrongQueueMethod, 405).ok) {
    throw new Error(`${label}: queue wrong method expected 405`)
  }

  const wrongLifeMethod = await proxyFetch(containerName, lifePath, { method: 'GET' })
  if (!assertLocalReject(wrongLifeMethod, 405).ok) {
    throw new Error(`${label}: lifecycle wrong method expected 405`)
  }

  const wrongValidationMethod = await proxyFetch(
    containerName,
    '/form-definition-service/api/v1/form-definitions/validation',
    { method: 'GET' },
  )
  if (!assertLocalReject(wrongValidationMethod, 405).ok) {
    throw new Error(`${label}: validation wrong method expected 405`)
  }

  const wrongVersionsMethod = await proxyFetch(
    containerName,
    '/form-definition-service/api/v1/form-definitions/versions?serviceId=demo',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  )
  if (!assertLocalReject(wrongVersionsMethod, 405).ok) {
    throw new Error(`${label}: versions wrong method expected 405`)
  }

  const wrongDraftMethod = await proxyFetch(
    containerName,
    '/form-definition-service/api/v1/form-definitions?serviceId=demo&version=1',
    { method: 'DELETE' },
  )
  if (!assertLocalReject(wrongDraftMethod, 405).ok) {
    throw new Error(`${label}: form-definitions wrong method expected 405`)
  }

  const wrongBuilderCloneMethod = await proxyFetch(
    containerName,
    '/form-definition-service/api/v1/form-definitions/builder/drafts/from-version?serviceId=demo&sourceVersion=1',
    { method: 'GET' },
  )
  if (!assertLocalReject(wrongBuilderCloneMethod, 405).ok) {
    throw new Error(`${label}: builder clone wrong method expected 405`)
  }

  await assertBlocked(containerName, label, [
    '/form-definition-service/api/v1/form-definitions/published/latest?serviceId=x',
  ])

  for (const code of [401, 403, 404, 409, 412, 422, 428]) {
    const res = await proxyFetch(
      containerName,
      `/form-definition-service/api/v1/form-definitions/governance/queue?mockStatus=${code}`,
    )
    const a = assertProxyResponse(res, { expectStatus: code, expectEtag: KNOWN_ETAG })
    if (!a.ok) throw new Error(`${label} status ${code}:\n- ${a.failures.join('\n- ')}`)
  }

  const spa = await proxyFetch(containerName, '/does-not-exist-spa-fallback')
  if (spa.status !== 200) {
    throw new Error(`${label}: SPA fallback expected 200, got ${spa.status}`)
  }

  const observed = await mockRequests()
  const queueObs = observed.find(
    (r) => r.method === 'GET' && String(r.url).includes('/governance/queue'),
  )
  const detailObs = observed.find(
    (r) => r.method === 'GET' && String(r.url).includes('/governance/detail'),
  )
  const lifeObs = observed.find(
    (r) => r.method === 'POST' && String(r.url).includes('/governance/lifecycle-transitions'),
  )
  const validationObs = observed.find(
    (r) => r.method === 'POST' && String(r.url).includes('/validation'),
  )
  const createObs = observed.find(
    (r) =>
      r.method === 'POST' &&
      /^\/form-definition-service\/api\/v1\/form-definitions\/?$/.test(
        String(r.url || '').split('?')[0],
      ),
  )
  const getObs = observed.find(
    (r) =>
      r.method === 'GET' &&
      String(r.url || '').startsWith('/form-definition-service/api/v1/form-definitions?') &&
      String(r.url || '').includes('serviceId=demo'),
  )
  const putObs = observed.find(
    (r) =>
      r.method === 'PUT' &&
      String(r.url || '').startsWith('/form-definition-service/api/v1/form-definitions?'),
  )
  const versionsObs = observed.find(
    (r) => r.method === 'GET' && String(r.url).includes('/versions'),
  )
  const cloneObs = observed.find(
    (r) => r.method === 'POST' && String(r.url).includes('/builder/drafts/from-version'),
  )
  const submitObs = observed.find(
    (r) => r.method === 'POST' && String(r.url).includes('/builder/lifecycle-transitions'),
  )

  for (const [name, obs, opts] of [
    ['queue', queueObs, { method: 'GET', urlIncludes: 'afterServiceId=a', expectAuth: true }],
    ['detail', detailObs, { method: 'GET', urlIncludes: 'serviceId=demo', expectAuth: true }],
    [
      'lifecycle',
      lifeObs,
      {
        method: 'POST',
        urlIncludes: '/governance/lifecycle-transitions',
        expectAuth: true,
        expectIfMatch: true,
        minBodyBytes: 10,
      },
    ],
    [
      'validation',
      validationObs,
      { method: 'POST', urlIncludes: '/validation', expectAuth: true, minBodyBytes: 5 },
    ],
    [
      'draft-create',
      createObs,
      {
        method: 'POST',
        urlIncludes: '/api/v1/form-definitions',
        expectAuth: true,
        minBodyBytes: 5,
      },
    ],
    ['exact-get', getObs, { method: 'GET', urlIncludes: 'version=1', expectAuth: true }],
    [
      'draft-replace',
      putObs,
      {
        method: 'PUT',
        urlIncludes: 'serviceId=demo',
        expectAuth: true,
        expectIfMatch: true,
        minBodyBytes: 5,
      },
    ],
    ['versions', versionsObs, { method: 'GET', urlIncludes: 'limit=10', expectAuth: true }],
    [
      'builder-clone',
      cloneObs,
      {
        method: 'POST',
        urlIncludes: '/builder/drafts/from-version',
        expectAuth: true,
        expectIfMatch: true,
        minBodyBytes: 2,
      },
    ],
    [
      'builder-submit',
      submitObs,
      {
        method: 'POST',
        urlIncludes: '/builder/lifecycle-transitions',
        expectAuth: true,
        expectIfMatch: true,
        minBodyBytes: 10,
      },
    ],
  ]) {
    const a = assertUpstreamObservation(obs, opts)
    if (!a.ok) throw new Error(`${label} upstream ${name}:\n- ${a.failures.join('\n- ')}`)
  }

  const techClone = (observed || []).filter(
    (r) =>
      String(r.url || '').includes('/drafts/from-version') &&
      !String(r.url || '').includes('/builder/drafts/from-version'),
  )
  if (techClone.length > 0) {
    throw new Error(`${label}: technical clone reached upstream`)
  }
  const publishedOrActuator = (observed || []).filter(
    (r) =>
      String(r.url || '').includes('/published/latest') ||
      String(r.url || '').includes('/actuator/'),
  )
  if (publishedOrActuator.length > 0) {
    throw new Error(`${label}: published/latest or actuator reached upstream`)
  }
  const techLife = (observed || []).filter(
    (r) =>
      String(r.url || '').includes('/lifecycle-transitions') &&
      !String(r.url || '').includes('/governance/lifecycle-transitions') &&
      !String(r.url || '').includes('/builder/lifecycle-transitions'),
  )
  if (techLife.length > 0) {
    throw new Error(`${label}: technical lifecycle reached upstream`)
  }

  log(`${label}: allowlist/deny/method/header/status/cache/SPA contract OK`)
}

async function main() {
  let exitCode = 1
  let htmlDir = null
  try {
    requireDocker()
    staticPortalChecks()

    htmlDir = mkdtempSync(join(tmpdir(), 'dg20-e53a-html-'))
    writeSpaFixture(htmlDir)

    startMock()
    await waitMockReady()

    startNginx({
      name: ids.officer,
      portalRoot: OFFICER,
      upstream: 'http://mock-fds:8080',
      htmlDir,
    })
    await nginxTest(ids.officer)
    await runOfficerSuite(ids.officer)

    startNginx({
      name: ids.citizen,
      portalRoot: CITIZEN,
      upstream: 'http://mock-fds:8080',
      htmlDir,
    })
    await nginxTest(ids.citizen)
    await runCitizenSuite(ids.citizen)

    // Alternate upstream hostname without rebuilding portal assets (officer allowlist path).
    startNginx({
      name: ids.alt,
      portalRoot: OFFICER,
      upstream: 'http://form-definition-service:8080',
      htmlDir,
    })
    await nginxTest(ids.alt)
    await resetMock()
    const alt = await proxyFetch(
      ids.alt,
      '/form-definition-service/api/v1/form-definitions/governance/queue?afterServiceId=alt',
    )
    const altAssert = assertProxyResponse(alt, { expectStatus: 200, expectEtag: KNOWN_ETAG })
    if (!altAssert.ok) throw new Error(`alternate upstream:\n- ${altAssert.failures.join('\n- ')}`)
    const altObserved = await mockRequests()
    if (!altObserved.some((r) => String(r.url || '').includes('afterServiceId=alt'))) {
      throw new Error('alternate upstream did not reach mock via form-definition-service alias')
    }
    log('alternate FORM_DEFINITION_SERVICE_UPSTREAM injection OK (no asset rebuild)')

    log('PASS — portal FDS least-privilege nginx proxy verified (FB-E5.3A.1)')
    log('SUMMARY no-deploy no-push no-helm no-kubectl no-portal-image-build')
    exitCode = 0
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    exitCode = 1
  } finally {
    await cleanup()
    if (htmlDir) {
      try {
        rmSync(htmlDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
  process.exitCode = exitCode
}

process.on('SIGINT', () => {
  void cleanup().finally(() => process.exit(130))
})
process.on('SIGTERM', () => {
  void cleanup().finally(() => process.exit(143))
})

await main()

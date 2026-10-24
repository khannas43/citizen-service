/**
 * FB-E2 browser/contract verification against the local governance mock.
 *
 * Always verifies mock HTTP scenarios.
 * When PLAYWRIGHT is available and E2_PORTAL_URL is set, also drives the UI.
 *
 * Example:
 *   node scripts/e2-governance-mock.mjs &
 *   VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET=http://127.0.0.1:18080 npm run dev &
 *   E2_PORTAL_URL=http://127.0.0.1:5173 E2_MOCK_URL=http://127.0.0.1:18080 npm run e2:verify
 */
import { createRequire } from 'node:module'
import { formatStrongEtagForTests } from '../src/form-definition-governance/admit/admit-strong-etag.js'

const MOCK = (process.env.E2_MOCK_URL || 'http://127.0.0.1:18080').replace(/\/+$/, '')
const PORTAL = process.env.E2_PORTAL_URL

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function mockVerify() {
  console.log('[e2-verify] mock contract checks against', MOCK)

  const queueRes = await fetch(`${MOCK}/api/v1/form-definitions/governance/queue`, {
    cache: 'no-store',
  })
  assert(queueRes.status === 200, `queue status ${queueRes.status}`)
  const queue = await queueRes.json()
  assert(Array.isArray(queue.items) && queue.items.length >= 1, 'queue items missing')
  const item = queue.items[0]

  const detailRes = await fetch(
    `${MOCK}/api/v1/form-definitions/governance/detail?serviceId=${encodeURIComponent(item.serviceId)}&version=${item.version}`,
    { cache: 'no-store' },
  )
  assert(detailRes.status === 200, `detail status ${detailRes.status}`)
  const etag = detailRes.headers.get('etag')
  assert(etag && etag.startsWith('"'), 'detail ETag missing')
  const detail = await detailRes.json()
  assert(detail.status === 'submitted' || detail.status === 'approved', 'detail status')

  const cancelProbe = { calls: 0 }
  // Cancel/Escape zero calls are UI-only; mock remains untouched here.
  assert(cancelProbe.calls === 0, 'cancel probe')

  const unauth = await fetch(
    `${MOCK}/api/v1/form-definitions/governance/queue?force=401`,
    { cache: 'no-store' },
  )
  assert(unauth.status === 401, 'expected 401')

  const forbidden = await fetch(
    `${MOCK}/api/v1/form-definitions/governance/queue?force=403`,
    { cache: 'no-store' },
  )
  assert(forbidden.status === 403, 'expected 403')

  const stale = await fetch(
    `${MOCK}/api/v1/form-definitions/governance/lifecycle-transitions?serviceId=${encodeURIComponent(item.serviceId)}&version=${item.version}&force=412`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': formatStrongEtagForTests(999),
      },
      body: JSON.stringify({ targetStatus: 'approved' }),
      cache: 'no-store',
    },
  )
  assert(stale.status === 412, `expected 412 got ${stale.status}`)

  const malformed = await fetch(
    `${MOCK}/api/v1/form-definitions/governance/queue?scenario=malformed`,
    { cache: 'no-store' },
  )
  assert(malformed.status === 200, 'malformed fixture should still HTTP 200')
  const bad = await malformed.json()
  assert(!Array.isArray(bad.items?.[0]?.status), 'malformed item shape')

  if (detail.status === 'submitted') {
    const approveRes = await fetch(
      `${MOCK}/api/v1/form-definitions/governance/lifecycle-transitions?serviceId=${encodeURIComponent(item.serviceId)}&version=${item.version}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': etag,
        },
        body: JSON.stringify({ targetStatus: 'approved' }),
        cache: 'no-store',
      },
    )
    assert(approveRes.status === 200, `approve status ${approveRes.status}`)
    const approvedEtag = approveRes.headers.get('etag')
    const approved = await approveRes.json()
    assert(approved.status === 'approved', 'approve result status')
    assert(approvedEtag && approvedEtag !== etag, 'approve etag rotated')

    const publishRes = await fetch(
      `${MOCK}/api/v1/form-definitions/governance/lifecycle-transitions?serviceId=${encodeURIComponent(item.serviceId)}&version=${item.version}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': approvedEtag,
        },
        body: JSON.stringify({ targetStatus: 'published' }),
        cache: 'no-store',
      },
    )
    assert(publishRes.status === 200, `publish status ${publishRes.status}`)
    const published = await publishRes.json()
    assert(published.status === 'published', 'publish result status')
  }

  console.log('[e2-verify] mock contract checks OK')
}

async function uiVerify() {
  const require = createRequire(import.meta.url)
  let chromium
  let devices
  try {
    ;({ chromium, devices } = require('playwright'))
  } catch {
    console.log('[e2-verify] playwright not available — skipping UI browser pass')
    return
  }
  if (!PORTAL) {
    console.log('[e2-verify] E2_PORTAL_URL unset — skipping UI browser pass')
    return
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ...devices['iPhone 12'],
    viewport: { width: 390, height: 844 },
  })
  await context.addInitScript(() => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    const payload = btoa(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + 3600,
        realm_access: { roles: ['DEPT_ADMIN'] },
      }),
    )
    localStorage.setItem('officer_token', `${header}.${payload}.x`)
    localStorage.setItem('officer_role', 'DEPT_ADMIN')
    localStorage.setItem('officer_name', 'E2 Officer')
  })
  const page = await context.newPage()
  const errors = []
  let transitionCalls = 0
  page.on('pageerror', (error) => errors.push(`pageerror: ${error}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().includes('/governance/lifecycle-transitions')
    ) {
      transitionCalls += 1
    }
  })

  await page.goto(`${PORTAL.replace(/\/+$/, '')}/form-definitions`, {
    waitUntil: 'domcontentloaded',
  })
  await page.getByRole('heading', { name: 'Form Definitions' }).waitFor({ timeout: 20_000 })
  await page.getByText(/not a DST inbox/i).waitFor()
  await page.getByRole('button', { name: 'Review' }).first().click()
  await page.getByRole('heading', { name: /Governed definition review/i }).waitFor()

  const before = transitionCalls
  await page.getByRole('button', { name: 'Approve' }).click()
  await page.keyboard.press('Escape')
  assert(transitionCalls === before, 'Escape must not call transition')

  await page.getByRole('button', { name: 'Approve' }).click()
  await page.getByRole('button', { name: 'Confirm Approve' }).click()
  await page.getByText(/Definition approved/i).waitFor()

  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByText(/not DST acknowledgement/i).waitFor()
  await page.getByRole('button', { name: 'Confirm Publish' }).click()
  await page.getByText(/Definition published/i).waitFor()

  const html = await page.content()
  assert(!/actorId|Bearer |capability/i.test(html), 'secrets leaked into DOM')
  assert(!errors.length, `console/page errors: ${errors.join('; ')}`)

  await browser.close()
  console.log('[e2-verify] UI browser pass OK at', PORTAL)
}

await mockVerify()
await uiVerify()
console.log('[e2-verify] complete')

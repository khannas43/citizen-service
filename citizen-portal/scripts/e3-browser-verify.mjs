/**
 * FB-E3 mock/browser verification for Citizen Portal published-form integration.
 *
 * Always verifies mock HTTP scenarios.
 * When Playwright is available and E3_PORTAL_URL is set, also drives the UI.
 *
 * Example:
 *   npm run e3:mock &
 *   VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET=http://127.0.0.1:18081 \
 *     VITE_DG20_TECHNICAL_FORM_SERVICE_ID=dg20-technical-preview npm run dev &
 *   E3_PORTAL_URL=http://127.0.0.1:5174 E3_MOCK_URL=http://127.0.0.1:18081 npm run e3:verify
 */
import { createRequire } from 'node:module'
import { E3_TECHNICAL_SERVICE_ID } from '../src/acceptance/e3-published-definition.js'

const MOCK = (process.env.E3_MOCK_URL || 'http://127.0.0.1:18081').replace(/\/+$/, '')
const PORTAL = process.env.E3_PORTAL_URL

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function mockVerify() {
  console.log('[e3-verify] mock contract checks against', MOCK)

  const okRes = await fetch(
    `${MOCK}/api/v1/form-definitions/published/latest?serviceId=${encodeURIComponent(E3_TECHNICAL_SERVICE_ID)}`,
    { cache: 'no-store', headers: { Accept: 'application/json' } },
  )
  assert(okRes.status === 200, `published latest status ${okRes.status}`)
  assert(okRes.headers.get('etag'), 'mock may send ETag but portal must ignore it')
  const body = await okRes.json()
  assert(body.serviceId === E3_TECHNICAL_SERVICE_ID, 'serviceId mismatch')
  assert(body.status === 'published', 'status must be published')
  assert(Number.isInteger(body.version) && body.version > 0, 'version')

  const notFound = await fetch(
    `${MOCK}/api/v1/form-definitions/published/latest?serviceId=missing-service`,
    { cache: 'no-store' },
  )
  assert(notFound.status === 404, `expected 404 got ${notFound.status}`)

  const malformed = await fetch(
    `${MOCK}/api/v1/form-definitions/published/latest?serviceId=${encodeURIComponent(E3_TECHNICAL_SERVICE_ID)}&scenario=malformed`,
    { cache: 'no-store' },
  )
  assert(malformed.status === 200, 'malformed fixture should still HTTP 200')
  const bad = await malformed.json()
  assert(typeof bad.version === 'string', 'malformed version type')

  const delayedStarted = Date.now()
  const delayed = await fetch(
    `${MOCK}/api/v1/form-definitions/published/latest?serviceId=${encodeURIComponent(E3_TECHNICAL_SERVICE_ID)}&scenario=delayed&delayMs=200`,
    { cache: 'no-store' },
  )
  assert(delayed.status === 200, 'delayed success')
  assert(Date.now() - delayedStarted >= 150, 'delayed response should wait')

  console.log('[e3-verify] mock contract checks OK')
}

async function uiVerify() {
  const require = createRequire(import.meta.url)
  let chromium
  try {
    ;({ chromium } = require('playwright'))
  } catch {
    console.log('[e3-verify] playwright not available — skipping UI browser pass')
    return
  }
  if (!PORTAL) {
    console.log('[e3-verify] E3_PORTAL_URL unset — skipping UI browser pass')
    return
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const consoleErrors = []
  context.on('page', (page) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
  })

  await context.addInitScript(() => {
    localStorage.setItem('citizen_token', 'e3-technical-token')
    localStorage.setItem(
      'citizen_profile',
      JSON.stringify({ name: 'E3 Citizen', aadhaarRef: 'XXXX-XXXX-1001' }),
    )
    localStorage.setItem('lang', 'en')
  })

  await context.route('**/auth-service/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, role: 'CITIZEN' }),
    })
  })
  await context.route('**/v1/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, role: 'CITIZEN' }),
    })
  })

  const page = await context.newPage()
  const servicePath = `/apply/${encodeURIComponent(E3_TECHNICAL_SERVICE_ID)}`
  await page.goto(`${PORTAL.replace(/\/+$/, '')}${servicePath}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-dg20-renderer]', { timeout: 20000 })
  assert(await page.locator('h1').count(), 'heading present')

  await page.getByLabel(/Applicant name/i).fill('Asha Patel')
  await page.getByRole('button', { name: /Next/i }).click()
  await page.waitForSelector('text=/Household/i')

  await page.evaluate(() => {
    localStorage.setItem('lang', 'gu')
  })
  // Layout toggle if present
  const toggle = page.getByRole('button', { name: /EN\s*\|\s*ગુ|ગુ|Gujarati/i })
  if (await toggle.count()) {
    await toggle.first().click()
  } else {
    await page.evaluate(() => {
      window.dispatchEvent(new Event('languageChanged'))
    })
  }

  // Prefer clicking language control in layout
  const langBtn = page.locator('button, a').filter({ hasText: /ગુ|GU|Gujarati|EN/ })
  if (await langBtn.count()) {
    await langBtn.first().click().catch(() => {})
  }

  await page.waitForTimeout(300)
  const nameStillThere = await page.getByDisplayValue('Asha Patel').count()
  assert(nameStillThere > 0, 'formData preserved across locale attempt')

  await page.getByRole('button', { name: /Back|પાછા/i }).click()
  await page.waitForSelector('[data-dg20-widget="caf-prefill"]')
  const unavailable = await page.getByText(/temporarily unavailable|અનુપલબ્ધ/i).count()
  assert(unavailable > 0, 'unavailable CAF copy')

  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    href: location.href,
  }))
  assert(!JSON.stringify(storage.local).includes('jsonSchema'), 'no definition in localStorage')
  assert(!JSON.stringify(storage.session).includes('applicant_name'), 'no formData in sessionStorage')
  assert(!storage.href.includes('formData'), 'no formData in URL')
  assert(!JSON.stringify(storage).toLowerCase().includes('ignored-by-citizen'), 'ETag not persisted')

  await page.goto(`${PORTAL.replace(/\/+$/, '')}/apply/caf`, { waitUntil: 'networkidle' })
  assert((await page.content()).toLowerCase().includes('caf') || (await page.locator('h1').count()) > 0, 'legacy CAF opens')

  const unexpected = consoleErrors.filter(
    (t) => !/favicon|Download the React DevTools/i.test(t),
  )
  assert(unexpected.length === 0, `unexpected console errors: ${unexpected.join(' | ')}`)

  await browser.close()
  console.log('[e3-verify] UI browser pass OK')
}

await mockVerify()
await uiVerify()
console.log('[e3-verify] complete')

/**
 * FB-D7 / D7.1 / D7.1.1 browser verify helper (Playwright).
 * Requires: mock on :8080, Vite on :5173, and `playwright` resolvable via NODE_PATH.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let chromium
let devices
try {
  ;({ chromium, devices } = require('playwright'))
} catch {
  console.error('Install playwright (e.g. in /tmp) and set NODE_PATH to its node_modules')
  process.exit(1)
}

const BASE = process.env.D7_BUILDER_URL || 'http://127.0.0.1:5173/'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 390, height: 844 },
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (err) => errors.push(String(err)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })

let loadCalls = 0
page.on('request', (req) => {
  if (req.method() === 'GET' && req.url().includes('/api/v1/form-definitions?')) {
    loadCalls += 1
  }
})

// --- Load cancel: zero GETs ---
await page.getByLabel(/Service ID/i).fill('should-not-load')
await page.getByRole('button', { name: /^Load$/i }).click()
const discard = page.locator('#dg20-builder-persist-discard')
await discard.waitFor({ timeout: 10000 })
await discard.getByRole('button', { name: /Cancel|રદ કરો/i }).click()
await discard.waitFor({ state: 'detached' })
if (loadCalls !== 0) {
  throw new Error(`expected 0 load calls after cancel, got ${loadCalls}`)
}

// --- Validate → Create ---
await page.getByRole('button', { name: /^Validate$/i }).click()
await page.waitForFunction(() => {
  const btn = document.querySelector('[data-testid="save-draft-button"]')
  return btn && !btn.hasAttribute('disabled')
})
const createRespPromise = page.waitForResponse(
  (res) =>
    res.request().method() === 'POST' &&
    /\/api\/v1\/form-definitions$/.test(new URL(res.url()).pathname),
)
await page.getByTestId('save-draft-button').click()
const createResp = await createRespPromise
if (createResp.status() !== 201) {
  throw new Error(`unexpected create status ${createResp.status()}`)
}
await page.getByTestId('persist-success').waitFor()
const createdText = await page.getByTestId('persist-success').innerText()
if (!/Draft created|ડ્રાફ્ટ બનાવાયું/i.test(createdText)) {
  throw new Error(`expected create success copy, got ${createdText}`)
}

// --- Delayed Save preserves Property draft ---
let releasePut
const putGate = new Promise((resolve) => {
  releasePut = resolve
})
await page.route('**/api/v1/form-definitions?**', async (route) => {
  if (route.request().method() === 'PUT') {
    await putGate
  }
  await route.continue()
})

const addShort = page.getByRole('button', { name: /Add Short text/i })
if (await addShort.count()) {
  await addShort.click()
} else {
  await page
    .getByRole('button', { name: /^Short text$/i })
    .first()
    .click()
}
await page.getByRole('button', { name: /^Validate$/i }).click()
await page.waitForFunction(() => {
  const btn = document.querySelector('[data-testid="save-draft-button"]')
  return btn && !btn.hasAttribute('disabled')
})
const putReqPromise = page.waitForRequest(
  (req) => req.method() === 'PUT' && req.url().includes('/form-definitions'),
)
await page.getByTestId('save-draft-button').click()
await putReqPromise

const label = page.getByLabel(/Label \(English\)/i).first()
await label.waitFor({ timeout: 5000 })
await label.fill('DraftDuringDelayedSave')
releasePut()
await page.getByTestId('persist-success').waitFor()
const savedText = await page.getByTestId('persist-success').innerText()
if (!/Draft saved|ડ્રાફ્ટ સાચવાયું/i.test(savedText)) {
  throw new Error(`expected save success copy, got ${savedText}`)
}
const labelAfter = await page
  .getByLabel(/Label \(English\)/i)
  .first()
  .inputValue()
if (!labelAfter.includes('DraftDuringDelayedSave')) {
  throw new Error(`expected preserved property draft, got ${labelAfter}`)
}
await page.unroute('**/api/v1/form-definitions?**')

// --- GET load → Draft loaded ---
await page.getByLabel(/Service ID/i).fill('illustrative-builder-d0-preview')
await page.getByLabel(/^Version$/i).fill('1')
const loadRespPromise = page.waitForResponse(
  (res) => res.request().method() === 'GET' && res.url().includes('/form-definitions?'),
  { timeout: 20000 },
)
await page.getByRole('button', { name: /^Load$/i }).click()
const loadDiscard = page.locator('#dg20-builder-persist-discard')
try {
  await loadDiscard.waitFor({ timeout: 1500 })
  await loadDiscard.getByRole('button', { name: /Discard local changes and load|સ્થાનિક/i }).click()
} catch {
  // may load without discard when clean
}
await loadRespPromise
await page.getByTestId('persist-success').waitFor()
const loadedText = await page.getByTestId('persist-success').innerText()
if (!/Draft loaded|ડ્રાફ્ટ લોડ/i.test(loadedText)) {
  throw new Error(`expected load success copy, got ${loadedText}`)
}

// --- Load failure → edit → Retry → discard confirmation; Cancel → zero new GETs ---
const loadsBeforeFail = loadCalls
await page.getByLabel(/Service ID/i).fill('missing-draft-xyz')
await page.getByLabel(/^Version$/i).fill('9')
await page.getByRole('button', { name: /^Load$/i }).click()
try {
  await page.locator('#dg20-builder-persist-discard').waitFor({ timeout: 1500 })
  await page
    .locator('#dg20-builder-persist-discard')
    .getByRole('button', { name: /Discard local changes and load|સ્થાનિક/i })
    .click()
} catch {
  // already clean path
}
await page.locator('#dg20-builder-persist-load-failed').waitFor({ timeout: 10000 })
await page.getByRole('button', { name: /Add Short text/i }).click()
await page.getByRole('button', { name: /^Retry$/i }).click()
await page.locator('#dg20-builder-persist-discard').waitFor({ timeout: 10000 })
const loadsAfterRetryPrompt = loadCalls
await page
  .locator('#dg20-builder-persist-discard')
  .getByRole('button', { name: /Cancel|રદ કરો/i })
  .click()
if (loadCalls !== loadsAfterRetryPrompt) {
  throw new Error('Cancel after Retry discard must not issue new GETs')
}
if (loadCalls <= loadsBeforeFail) {
  throw new Error('expected at least one failed load GET')
}

// --- Save transport failure: one alert, no Load Retry ---
await page.route('**/api/v1/form-definitions', async (route) => {
  if (route.request().method() === 'POST') {
    await route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'failed' }),
    })
    return
  }
  await route.continue()
})
// Force local dirty create path: reload page for a fresh local draft
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /^Validate$/i }).click()
await page.waitForFunction(() => {
  const btn = document.querySelector('[data-testid="save-draft-button"]')
  return btn && !btn.hasAttribute('disabled')
})
await page.getByTestId('save-draft-button').click()
await page.getByTestId('persist-save-failed').waitFor({ timeout: 10000 })
const alerts = await page.locator('[role="alert"]').count()
if (alerts !== 1) {
  throw new Error(`expected exactly one alert on save failure, got ${alerts}`)
}
const openPanel = page.getByTestId('open-draft-panel')
if (await openPanel.getByRole('button', { name: /^Retry$/i }).count()) {
  throw new Error('Save failure must not show Load Retry')
}
await page.unroute('**/api/v1/form-definitions')

// --- Stale 412 preserves local definition ---
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.getByLabel(/Service ID/i).fill('illustrative-builder-d0-preview')
await page.getByLabel(/^Version$/i).fill('1')
const staleLoadPromise = page.waitForResponse(
  (res) => res.request().method() === 'GET' && res.url().includes('/form-definitions?'),
)
await page.getByRole('button', { name: /^Load$/i }).click()
try {
  await page.locator('#dg20-builder-persist-discard').waitFor({ timeout: 1500 })
  await page
    .locator('#dg20-builder-persist-discard')
    .getByRole('button', { name: /Discard local changes and load|સ્થાનિક/i })
    .click()
} catch {
  // clean
}
await staleLoadPromise
await page.getByTestId('persist-success').waitFor({ timeout: 10000 })
await page.getByRole('button', { name: /Add Short text/i }).click()
const serviceBeforeStale = await page.locator('.dg20-builder-header').innerText()
await page.route('**/api/v1/form-definitions?**', async (route) => {
  if (route.request().method() === 'PUT') {
    await route.fulfill({
      status: 412,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'stale_revision' }),
    })
    return
  }
  await route.continue()
})
await page.getByRole('button', { name: /^Validate$/i }).click()
await page.waitForFunction(() => {
  const btn = document.querySelector('[data-testid="save-draft-button"]')
  return btn && !btn.hasAttribute('disabled')
})
await page.getByTestId('save-draft-button').click()
await page.locator('#dg20-builder-persist-stale').waitFor({ timeout: 10000 })
const serviceAfterStale = await page.locator('.dg20-builder-header').innerText()
if (serviceAfterStale !== serviceBeforeStale) {
  throw new Error('stale 412 must preserve local definition identity chrome')
}
await page.unroute('**/api/v1/form-definitions?**')

await page.getByRole('button', { name: /^GU$/i }).click()
const body = await page.locator('body').innerText()
if (/"[A-Za-z0-9_-]{11}"/.test(body)) {
  throw new Error('ETag visible in DOM text')
}
if (/lockVersion|If-Match/i.test(body)) {
  throw new Error('internal persistence metadata visible in DOM')
}
const unexpected = errors.filter(
  (entry) => !/status of (409|500|412|404)/.test(entry) && !/Failed to load resource/.test(entry),
)
if (unexpected.length) {
  throw new Error(`errors:\n${unexpected.join('\n')}`)
}
console.log('D7.1.1 browser verify OK:', BASE)
await browser.close()

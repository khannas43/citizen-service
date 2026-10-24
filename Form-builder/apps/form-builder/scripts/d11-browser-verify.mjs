/**
 * FB-D11 browser verify — real Playwright keyboard/clicks only.
 * Requires: Vite on :5173 (or D11_BUILDER_URL), and `playwright` resolvable via NODE_PATH.
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass UI.
 * Do not invent file upload for photo-capture.
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

const BASE =
  process.env.D11_BUILDER_URL ||
  process.env.D10_BUILDER_URL ||
  process.env.D9_BUILDER_URL ||
  'http://localhost:5173/'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 390, height: 844 },
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (err) => errors.push(`pageerror: ${err}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })

// --- Address Block: set defaultStateCode GJ, Apply, clear and Apply ---
await page.getByRole('button', { name: 'Add Address block' }).click()
await page.locator('[data-field-id="address_block_1"]').waitFor()
await page.locator('[data-field-id="address_block_1"]').click()

const defaultState = page.getByLabel(/Default state code/i)
await defaultState.waitFor()
await defaultState.fill('GJ')
const applyBtn = page.getByRole('button', { name: 'Apply changes' })
await applyBtn.waitFor({ state: 'visible' })
if (await applyBtn.isDisabled()) {
  throw new Error('expected Apply enabled after editing defaultStateCode')
}
await applyBtn.click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
if ((await defaultState.inputValue()) !== 'GJ') {
  throw new Error('expected defaultStateCode persisted as GJ after Apply')
}

await defaultState.fill('')
await applyBtn.click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
if ((await defaultState.inputValue()) !== '') {
  throw new Error('expected defaultStateCode cleared after Apply')
}

// --- Photo Capture: locked policy text (no file upload) ---
await page.getByRole('button', { name: 'Add Photo capture' }).click()
await page.locator('[data-field-id="photo_capture_1"]').waitFor()
await page.locator('[data-field-id="photo_capture_1"]').click()
await page.getByText(/CLEAN object-store reference/i).waitFor()
await page.getByText(/provisional/i).waitFor()
if ((await page.getByLabel(/mime/i).count()) > 0) {
  throw new Error('expected MIME / policy fields not editable')
}

// Property / Bilingual isolation
await page.locator('[data-field-id="address_block_1"]').click()
await page.getByRole('tab', { name: 'Bilingual' }).click()
const errorEn = page.locator('#dg20-builder-bilingual-field-address_block_1-errorEn')
await errorEn.fill('Only EN')
await page.locator('[data-field-id="address_block_1"]').click()
await page.getByLabel('Required').click()
await page.getByRole('button', { name: 'Apply changes' }).click()
await page.getByRole('tab', { name: 'Bilingual' }).click()
if ((await errorEn.inputValue()) !== 'Only EN') {
  throw new Error('expected bilingual error draft preserved after Property Apply')
}

// Steps still operable
await page.getByRole('tab', { name: 'Steps' }).click()
await page.getByRole('heading', { name: /steps/i }).waitFor()

// Unavailable preview (no GeographyAdapter / FileStorageAdapter)
const preview = page.locator('.dg20-builder-preview')
const previewText = await preview.innerText()
if (!/unavailable|geography|address|photo|storage|અનુપલબ્ધ/i.test(previewText)) {
  throw new Error('expected unavailable address/photo preview copy')
}
if ((await preview.locator('[data-dg20-widget="address-block"]').count()) < 1) {
  throw new Error('expected address-block in preview')
}
if ((await preview.locator('[data-dg20-widget="photo-capture"]').count()) < 1) {
  throw new Error('expected photo-capture in preview')
}

// EN/GU locale
await page.locator('.dg20-builder-locale-btn', { hasText: 'GU' }).click()
await page.locator('[data-field-id="photo_capture_1"]').click()
await page.getByText(/CLEAN|JPEG|PNG|5 MiB|300/i).waitFor()
await page.locator('.dg20-builder-locale-btn', { hasText: 'EN' }).click()

if (errors.length > 0) {
  throw new Error(`unexpected console/page errors:\n${errors.join('\n')}`)
}

console.log('FB-D11 browser verify OK at', BASE)
await browser.close()

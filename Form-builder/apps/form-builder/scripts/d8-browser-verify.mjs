/**
 * FB-D8 browser verify helper (Playwright).
 * Requires: Vite on :5173, and `playwright` resolvable via NODE_PATH.
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

const BASE = process.env.D8_BUILDER_URL || 'http://127.0.0.1:5173/'

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

await page.getByRole('button', { name: 'Add Aadhaar' }).click()
await page.getByRole('button', { name: 'Add Mobile with OTP' }).click()
await page.getByRole('button', { name: 'Add Bank account' }).click()

await page.locator('[data-field-id="mobile_otp_1"]').click()
await page.getByText(/SMS only in v1/i).waitFor()

const labelEn = page.getByLabel('Label (English)')
await labelEn.fill('Citizen mobile')
await page.getByRole('button', { name: 'Apply changes' }).click()
await page
  .locator('.dg20-builder-editor__status')
  .getByText(/No unsaved changes/i)
  .waitFor()

await page.getByRole('tab', { name: 'Bilingual' }).click()
const errorEn = page.locator('#dg20-builder-bilingual-field-mobile_otp_1-errorEn')
await errorEn.fill('Only EN')
await page.locator('[data-field-id="mobile_otp_1"]').click()
await page.getByLabel('Required').click()
await page.getByRole('button', { name: 'Apply changes' }).click()
await page.getByRole('tab', { name: 'Bilingual' }).click()
const retained = await page
  .locator('#dg20-builder-bilingual-field-mobile_otp_1-errorEn')
  .inputValue()
if (retained !== 'Only EN') {
  throw new Error(`expected bilingual error draft retained, got ${retained}`)
}

await page.getByRole('tab', { name: 'Steps' }).click()
await page
  .getByText(/Identity|Household/i)
  .first()
  .waitFor()

await page.locator('.dg20-builder-locale-btn', { hasText: 'GU' }).click()
await page.locator('[data-field-id="mobile_otp_1"]').click()
await page.getByText(/ફક્ત SMS/i).waitFor()
await page.locator('.dg20-builder-locale-btn', { hasText: 'EN' }).click()

const preview = page.locator('.dg20-builder-preview')
await preview
  .getByText(/temporarily unavailable/i)
  .first()
  .waitFor()
const previewHtml = await preview.innerHTML()
if (/challengeId|rawAadhaar|If-Match|\bETag\b/i.test(previewHtml)) {
  throw new Error('preview DOM leaked sensitive/ETag markers')
}

if (errors.length > 0) {
  throw new Error(`unexpected console/page errors:\n${errors.join('\n')}`)
}

console.log('FB-D8 browser verify OK at', BASE)
await browser.close()

/**
 * FB-D12 browser verify — real Playwright keyboard/clicks only.
 * Requires: Vite on :5173 (or D12_BUILDER_URL), and `playwright` resolvable via NODE_PATH.
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass UI.
 * Do not invent real file upload for doc-upload.
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
  process.env.D12_BUILDER_URL ||
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

// --- Document Upload: invalid then valid configured Add ---
await page.getByRole('button', { name: 'Add Document upload' }).click()
await page.getByTestId('configured-add-dialog').waitFor()
const mimeAdd = page.getByTestId('configured-add-allowed-mime-types')
await mimeAdd.waitFor()
if (!(await mimeAdd.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected allowed MIME types focused on open')
}

await page.getByTestId('configured-add-confirm').click()
await page.getByRole('alert').waitFor()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-allowed-mime-types"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await mimeAdd.fill('application/pdf')
await page.getByTestId('configured-add-max-file-size-bytes').fill('1048576')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="doc_upload_1"]').waitFor()

// Property Apply MIME/size change
await page.locator('[data-field-id="doc_upload_1"]').click()
const mimeEditor = page.getByLabel(/Allowed MIME types/i)
await mimeEditor.waitFor()
await mimeEditor.fill('application/pdf\nimage/png')
const maxSizeEditor = page.getByLabel(/Maximum file size/i)
await maxSizeEditor.fill('2097152')
const applyBtn = page.getByRole('button', { name: 'Apply changes' })
await applyBtn.waitFor({ state: 'visible' })
if (await applyBtn.isDisabled()) {
  throw new Error('expected Apply enabled after editing MIME/size')
}
await applyBtn.click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
if ((await maxSizeEditor.inputValue()) !== '2097152') {
  throw new Error('expected max file size persisted as 2097152 after Apply')
}

// --- DigiLocker: focus containment, then invalid→valid Add + Property Apply ---
await page.getByRole('button', { name: 'Add DigiLocker fetch' }).click()
await page.getByTestId('configured-add-dialog').waitFor()
const digiCode = page.getByTestId('configured-add-digilocker-document-type-code')
await digiCode.waitFor()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-digilocker-document-type-code"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await page.keyboard.press('Tab')
if (
  !(await page
    .getByTestId('configured-add-confirm')
    .evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected Confirm after Tab from DigiLocker code')
}
await page.keyboard.press('Tab')
if (
  !(await page.getByTestId('configured-add-cancel').evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected Cancel after Tab')
}
await page.keyboard.press('Tab')
if (!(await digiCode.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected Tab wrap back to DigiLocker code')
}

await page.getByTestId('configured-add-confirm').click()
await page.getByRole('alert').waitFor()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-digilocker-document-type-code"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await digiCode.fill('AADHAAR')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="digilocker_fetch_1"]').waitFor()

await page.locator('[data-field-id="digilocker_fetch_1"]').click()
const digiEditor = page.getByLabel(/DigiLocker document type code/i)
await digiEditor.waitFor()
await digiEditor.fill('PAN')
const digiApply = page.getByRole('button', { name: 'Apply changes' })
await digiApply.waitFor({ state: 'visible' })
if (await digiApply.isDisabled()) {
  throw new Error('expected Apply enabled after editing DigiLocker type code')
}
await digiApply.click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
if ((await digiEditor.inputValue()) !== 'PAN') {
  throw new Error('expected DigiLocker type code persisted as PAN after Apply')
}

// Property / Bilingual isolation briefly
await page.locator('[data-field-id="doc_upload_1"]').click()
await page.getByRole('tab', { name: 'Bilingual' }).click()
const errorEn = page.locator('#dg20-builder-bilingual-field-doc_upload_1-errorEn')
await errorEn.fill('Only EN')
await page.locator('[data-field-id="doc_upload_1"]').click()
await page.getByLabel('Required').click()
await page.getByRole('button', { name: 'Apply changes' }).click()
await page.getByRole('tab', { name: 'Bilingual' }).click()
if ((await errorEn.inputValue()) !== 'Only EN') {
  throw new Error('expected bilingual error draft preserved after Property Apply')
}

// Steps still operable
await page.getByRole('tab', { name: 'Steps' }).click()
await page.getByRole('heading', { name: /steps/i }).waitFor()

// Unavailable preview (no FileStorageAdapter / DigiLockerAdapter) — no real upload
const preview = page.locator('.dg20-builder-preview')
const previewText = await preview.innerText()
if (!/unavailable|document|upload|digilocker|storage|અનુપલબ્ધ/i.test(previewText)) {
  throw new Error('expected unavailable doc-upload/DigiLocker preview copy')
}
if ((await preview.locator('[data-dg20-widget="doc-upload"]').count()) < 1) {
  throw new Error('expected doc-upload in preview')
}
if ((await preview.locator('[data-dg20-widget="digilocker-fetch"]').count()) < 1) {
  throw new Error('expected digilocker-fetch in preview')
}

// EN/GU locale
await page.locator('.dg20-builder-locale-btn', { hasText: 'GU' }).click()
await page.locator('.dg20-builder-palette__item[data-widget-type="doc-upload"]').click()
await page.getByTestId('configured-add-dialog').waitFor()
await page
  .getByTestId('configured-add-dialog')
  .locator('label', { hasText: 'મંજૂર MIME પ્રકારો' })
  .waitFor()
await page.getByTestId('configured-add-cancel').click()
await page.locator('.dg20-builder-locale-btn', { hasText: 'EN' }).click()

if (errors.length > 0) {
  throw new Error(`unexpected console/page errors:\n${errors.join('\n')}`)
}

console.log('FB-D12 browser verify OK at', BASE)
await browser.close()

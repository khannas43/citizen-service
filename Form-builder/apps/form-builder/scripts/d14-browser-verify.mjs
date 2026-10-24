/**
 * FB-D14 browser verify — real Playwright keyboard/clicks only.
 * Requires: Vite on :5173 (or D14_BUILDER_URL), and `playwright` resolvable via NODE_PATH.
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass UI.
 * Do not invent ConsentLoggingAdapter or fabricate receipts.
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
  process.env.D14_BUILDER_URL ||
  process.env.D13_BUILDER_URL ||
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

// --- Eligibility: invalid then valid configured Add ---
await page.getByRole('button', { name: 'Add Eligibility declaration' }).click()
await page.getByTestId('configured-add-dialog').waitFor()
const declarationId = page.getByTestId('configured-add-declaration-id')
await declarationId.waitFor()
if (!(await declarationId.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected declarationId focused on open')
}

await page.getByTestId('configured-add-confirm').click()
await page.getByRole('alert').waitFor()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-declaration-id"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await declarationId.fill('DECL_BROWSER_V1')
await page.getByTestId('configured-add-confirm').click()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-declaration-text-en"]')
  return el instanceof HTMLElement && el === document.activeElement
})
await page
  .getByTestId('configured-add-declaration-text-en')
  .fill('I confirm eligibility for this service.')
await page.getByTestId('configured-add-confirm').click()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-declaration-text-gu"]')
  return el instanceof HTMLElement && el === document.activeElement
})
await page
  .getByTestId('configured-add-declaration-text-gu')
  .fill('હું આ સેવા માટે પાત્રતા પુષ્ટિ કરું છું.')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="eligibility_declaration_1"]').waitFor()

// Property Apply declarationId change
await page.locator('[data-field-id="eligibility_declaration_1"]').click()
const declarationEditor = page.getByLabel(/Declaration ID/i)
await declarationEditor.waitFor()
await declarationEditor.fill('DECL_BROWSER_V2')
const applyBtn = page.getByRole('button', { name: 'Apply changes' })
await applyBtn.waitFor({ state: 'visible' })
if (await applyBtn.isDisabled()) {
  throw new Error('expected Apply enabled after editing declarationId')
}
await applyBtn.click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
if ((await declarationEditor.inputValue()) !== 'DECL_BROWSER_V2') {
  throw new Error('expected declarationId persisted as DECL_BROWSER_V2 after Apply')
}

// Property / Bilingual isolation
await page.getByRole('tab', { name: 'Bilingual' }).click()
const errorEn = page.locator('#dg20-builder-bilingual-field-eligibility_declaration_1-errorEn')
await errorEn.fill('Only EN')
await page.locator('[data-field-id="eligibility_declaration_1"]').click()
const helpEn = page.locator('#dg20-builder-editor-eligibility_declaration_1-helpEn')
await helpEn.fill('Updated EN declaration help')
await page.getByRole('button', { name: 'Apply changes' }).click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
await page.getByRole('tab', { name: 'Bilingual' }).click()
if ((await errorEn.inputValue()) !== 'Only EN') {
  throw new Error('expected bilingual error draft preserved after Property Apply')
}

// Steps still operable
await page.getByRole('tab', { name: 'Steps' }).click()
await page.getByRole('heading', { name: /steps/i }).waitFor()

// Unavailable preview (no ConsentLoggingAdapter)
const preview = page.locator('.dg20-builder-preview')
const previewText = await preview.innerText()
if (!/unavailable|consent|declaration|adapter|અનુપલબ્ધ/i.test(previewText)) {
  throw new Error('expected unavailable eligibility preview copy')
}
if ((await preview.locator('[data-dg20-widget="eligibility-declaration"]').count()) < 1) {
  throw new Error('expected eligibility-declaration in preview')
}
const previewHtml = await preview.innerHTML()
if (/ETag|consentReceiptRef|receipt-|DECL_BROWSER/i.test(previewHtml)) {
  throw new Error('unexpected internal metadata leaked into preview DOM')
}

// EN/GU locale
await page.locator('.dg20-builder-locale-btn', { hasText: 'GU' }).click()
await page
  .locator('.dg20-builder-palette__item[data-widget-type="eligibility-declaration"]')
  .click()
await page.getByTestId('configured-add-dialog').waitFor()
await page.getByTestId('configured-add-dialog').locator('label', { hasText: 'ઘોષણા ID' }).waitFor()
await page.getByTestId('configured-add-cancel').click()
await page.locator('.dg20-builder-locale-btn', { hasText: 'EN' }).click()

const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth + 1,
)
if (overflow) {
  throw new Error('unexpected horizontal overflow at 390px')
}

if (errors.length > 0) {
  throw new Error(`unexpected console/page errors:\n${errors.join('\n')}`)
}

console.log('FB-D14 browser verify OK at', BASE)
await browser.close()

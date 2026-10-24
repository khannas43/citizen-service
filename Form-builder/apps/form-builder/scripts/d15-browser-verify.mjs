/**
 * FB-D15 browser verify — real Playwright keyboard/clicks only.
 * Requires: Vite on :5173 (or D15_BUILDER_URL), and `playwright` resolvable via NODE_PATH.
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass UI.
 * Do not invent CAF adapters or fabricate Golden Record values.
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
  process.env.D15_BUILDER_URL ||
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

// --- CAF: invalid then valid configured Add ---
await page.getByRole('button', { name: 'Add CAF pre-fill' }).click()
await page.getByTestId('configured-add-dialog').waitFor()
const cafAttribute = page.getByTestId('configured-add-caf-attribute')
await cafAttribute.waitFor()
if (!(await cafAttribute.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected cafAttribute focused on open')
}

await page.getByTestId('configured-add-confirm').click()
await page.getByRole('alert').waitFor()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-caf-attribute"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await cafAttribute.fill('citizen.fullName')
await page.getByTestId('configured-add-confirm').click()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-confidence-min"]')
  return el instanceof HTMLElement && el === document.activeElement
})
await page.getByTestId('configured-add-confidence-min').fill('0.8')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="caf_prefill_1"]').waitFor()

// Bindings workspace: edit / Apply / Cancel / Remove / recreate
await page.getByRole('tab', { name: 'Bindings' }).click()
await page.getByRole('heading', { name: /CAF Prefill bindings/i }).waitFor()
const attrInput = page.locator('#dg20-builder-binding-caf_prefill_1-cafAttribute')
const confInput = page.locator('#dg20-builder-binding-caf_prefill_1-confidenceMin')
await attrInput.waitFor()
await attrInput.fill('citizen.motherName')
await confInput.fill('0.9')
await page.getByRole('button', { name: /^Apply$/i }).click()
if ((await attrInput.inputValue()) !== 'citizen.motherName') {
  throw new Error('expected cafAttribute persisted after Apply')
}
if ((await confInput.inputValue()) !== '0.9') {
  throw new Error('expected confidenceMin persisted after Apply')
}

await confInput.fill('0.4')
await page.getByRole('button', { name: /^Cancel$/i }).click()
if ((await confInput.inputValue()) !== '0.9') {
  throw new Error('expected Cancel to restore committed confidenceMin')
}

await page.getByRole('button', { name: /Remove binding/i }).click()
await page
  .locator('.dg20-builder-bindings')
  .getByText(/unbound/i)
  .waitFor()

await attrInput.fill('citizen.fatherName')
await confInput.fill('0.7')
await page.getByRole('button', { name: /^Apply$/i }).click()
await page.locator('.dg20-builder-bindings').getByText(/bound/i).waitFor()

// Property / Bilingual isolation with binding draft
await confInput.fill('0.55')
await page.locator('[data-field-id="caf_prefill_1"]').click()
const labelEn = page.getByLabel(/Label \(English\)/i)
await labelEn.fill('CAF renamed')
await page.getByRole('button', { name: 'Apply changes' }).click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
await page.getByRole('tab', { name: 'Bindings' }).click()
if ((await confInput.inputValue()) !== '0.55') {
  throw new Error('expected binding draft preserved after Property Apply')
}

// Steps still operable
await page.getByRole('tab', { name: 'Steps' }).click()
await page.getByRole('heading', { name: /steps/i }).waitFor()

// Preview carries caf-prefill without inventing CAF values / leaking internals
const preview = page.locator('.dg20-builder-preview')
if ((await preview.locator('[data-dg20-widget="caf-prefill"]').count()) < 1) {
  throw new Error('expected caf-prefill in preview')
}
const previewHtml = await preview.innerHTML()
if (/confidenceMin|showValidation|ETag|adapter error/i.test(previewHtml)) {
  throw new Error('unexpected internal metadata leaked into preview DOM')
}
if (/citizen\.(fullName|motherName|fatherName)/.test(await preview.innerText())) {
  throw new Error('preview invented CAF attribute values')
}

// EN/GU locale for bindings heading
await page.getByRole('tab', { name: 'Bindings' }).click()
await page.locator('.dg20-builder-locale-btn', { hasText: 'GU' }).click()
await page.getByRole('heading', { name: /CAF Prefill બાઇન્ડિંગ્સ/i }).waitFor()
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

console.log('FB-D15 browser verify OK at', BASE)
await browser.close()

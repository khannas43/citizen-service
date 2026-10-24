/**
 * FB-D13 browser verify — real Playwright keyboard/clicks only.
 * Requires: Vite on :5173 (or D13_BUILDER_URL), and `playwright` resolvable via NODE_PATH.
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass UI.
 * Do not invent live fee computation or eSign provider flows.
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

// --- Fee field: invalid then valid configured Add ---
await page.getByRole('button', { name: 'Add Fee field' }).click()
await page.getByTestId('configured-add-dialog').waitFor()
const feeRule = page.getByTestId('configured-add-fee-rule-id')
await feeRule.waitFor()
if (!(await feeRule.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected feeRuleId focused on open')
}

await page.getByTestId('configured-add-confirm').click()
await page.getByRole('alert').waitFor()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-fee-rule-id"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await feeRule.fill('service-fee-v1')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="fee_field_1"]').waitFor()

// Property Apply feeRuleId change
await page.locator('[data-field-id="fee_field_1"]').click()
const feeEditor = page.getByLabel(/Fee rule ID/i)
await feeEditor.waitFor()
await feeEditor.fill('service-fee-v2')
const applyBtn = page.getByRole('button', { name: 'Apply changes' })
await applyBtn.waitFor({ state: 'visible' })
if (await applyBtn.isDisabled()) {
  throw new Error('expected Apply enabled after editing feeRuleId')
}
await applyBtn.click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
if ((await feeEditor.inputValue()) !== 'service-fee-v2') {
  throw new Error('expected feeRuleId persisted as service-fee-v2 after Apply')
}

// --- Signature/eSign: immediate Add + Required Apply ---
await page.getByRole('button', { name: 'Add eSign signature' }).click()
await page.locator('[data-field-id="signature_esign_1"]').waitFor()
await page.locator('[data-field-id="signature_esign_1"]').click()
await page
  .locator('.dg20-builder-editor__hint')
  .filter({ hasText: /signed artefact/i })
  .waitFor()
await page.getByLabel('Required').click()
const sigApply = page.getByRole('button', { name: 'Apply changes' })
await sigApply.waitFor({ state: 'visible' })
if (await sigApply.isDisabled()) {
  throw new Error('expected Apply enabled after toggling Required')
}
await sigApply.click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
if (!(await page.getByLabel('Required').isChecked())) {
  throw new Error('expected Required checked after Apply')
}

// Property / Bilingual isolation briefly
await page.locator('[data-field-id="signature_esign_1"]').click()
await page.getByRole('tab', { name: 'Bilingual' }).click()
const errorEn = page.locator('#dg20-builder-bilingual-field-signature_esign_1-errorEn')
await errorEn.fill('Only EN')
await page.locator('[data-field-id="signature_esign_1"]').click()
await page.getByLabel('Required').click()
await page.getByRole('button', { name: 'Apply changes' }).click()
await page.getByRole('tab', { name: 'Bilingual' }).click()
if ((await errorEn.inputValue()) !== 'Only EN') {
  throw new Error('expected bilingual error draft preserved after Property Apply')
}

// Steps still operable
await page.getByRole('tab', { name: 'Steps' }).click()
await page.getByRole('heading', { name: /steps/i }).waitFor()

// Unavailable preview (no FeeComputationAdapter / ESignAdapter)
const preview = page.locator('.dg20-builder-preview')
const previewText = await preview.innerText()
if (!/unavailable|fee|esign|signature|adapter|અનુપલબ્ધ/i.test(previewText)) {
  throw new Error('expected unavailable fee/eSign preview copy')
}
if ((await preview.locator('[data-dg20-widget="fee-field"]').count()) < 1) {
  throw new Error('expected fee-field in preview')
}
if ((await preview.locator('[data-dg20-widget="signature-esign"]').count()) < 1) {
  throw new Error('expected signature-esign in preview')
}

// EN/GU locale
await page.locator('.dg20-builder-locale-btn', { hasText: 'GU' }).click()
await page.locator('.dg20-builder-palette__item[data-widget-type="fee-field"]').click()
await page.getByTestId('configured-add-dialog').waitFor()
await page
  .getByTestId('configured-add-dialog')
  .locator('label', { hasText: 'ફી નિયમ ID' })
  .waitFor()
await page.getByTestId('configured-add-cancel').click()
await page.locator('.dg20-builder-locale-btn', { hasText: 'EN' }).click()

if (errors.length > 0) {
  throw new Error(`unexpected console/page errors:\n${errors.join('\n')}`)
}

console.log('FB-D13 browser verify OK at', BASE)
await browser.close()

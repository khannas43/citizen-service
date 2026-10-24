/**
 * FB-D10 browser verify — real Playwright keyboard actions only.
 * Requires: Vite on :5173, and `playwright` resolvable via NODE_PATH.
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass the modal.
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

const BASE = process.env.D10_BUILDER_URL || process.env.D9_BUILDER_URL || 'http://localhost:5173/'

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

// --- Multiselect: invalid bounds then valid Confirm ---
await page.getByRole('button', { name: 'Add Multi-select' }).click()
await page.getByTestId('configured-add-dialog').waitFor()
const master = page.getByTestId('configured-add-master-list-id')
await master.waitFor()
if (!(await master.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected masterListId focused on open')
}

for (const ch of 'status-list') {
  await page.keyboard.type(ch)
  if (!(await master.evaluate((el) => el === document.activeElement))) {
    throw new Error(`focus left masterListId while typing "${ch}"`)
  }
}
await page.getByTestId('configured-add-min-items').fill('5')
await page.getByTestId('configured-add-max-items').fill('2')
await page.getByTestId('configured-add-confirm').click()
await page.getByTestId('configured-add-max-items').waitFor()
const maxFocused = await page
  .getByTestId('configured-add-max-items')
  .evaluate((el) => el === document.activeElement)
if (!maxFocused) {
  throw new Error('expected maxItems focused after invalid Confirm')
}

await page.getByTestId('configured-add-max-items').fill('6')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="multiselect_1"]').waitFor()

// --- Multiselect Tab containment (fresh dialog) ---
await page.getByRole('button', { name: 'Add Multi-select' }).click()
await page.getByTestId('configured-add-dialog').waitFor()
await page.keyboard.press('Tab')
if (
  !(await page
    .getByTestId('configured-add-min-items')
    .evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected minItems after Tab')
}
await page.keyboard.press('Tab')
if (
  !(await page
    .getByTestId('configured-add-max-items')
    .evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected maxItems after Tab')
}
await page.keyboard.press('Tab')
if (
  !(await page
    .getByTestId('configured-add-confirm')
    .evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected Confirm after Tab')
}
await page.keyboard.press('Tab')
if (
  !(await page.getByTestId('configured-add-cancel').evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected Cancel after Tab')
}
await page.keyboard.press('Tab')
if (
  !(await page
    .getByTestId('configured-add-master-list-id')
    .evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected Tab wrap to masterListId')
}
await page.keyboard.press('Escape')
await page.getByTestId('configured-add-dialog').waitFor({ state: 'detached' })
const msPaletteFocused = await page
  .locator('.dg20-builder-palette__item[data-widget-type="multiselect"]')
  .evaluate((el) => el === document.activeElement)
if (!msPaletteFocused) {
  throw new Error('expected multiselect palette focused after Escape')
}

// --- Cascading: configure, Tab, Confirm, edit Apply ---
await page.getByRole('button', { name: 'Add Cascading dropdown' }).click()
await page.getByTestId('configured-add-parent-master-list-id').waitFor()
if (
  !(await page
    .getByTestId('configured-add-parent-master-list-id')
    .evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected parentMasterListId focused on open')
}
await page.keyboard.type('parent-list')
await page.keyboard.press('Tab')
if (
  !(await page
    .getByTestId('configured-add-child-master-list-id')
    .evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected childMasterListId after Tab')
}
await page.keyboard.type('child-list')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="cascading_dropdown_1"]').waitFor()

await page.locator('[data-field-id="cascading_dropdown_1"]').click()
const parentEditor = page.getByLabel('Parent master list ID')
await parentEditor.waitFor()
await parentEditor.fill('parent-list-v2')
const applyBtn = page.getByRole('button', { name: 'Apply changes' })
await applyBtn.waitFor({ state: 'visible' })
if (await applyBtn.isDisabled()) {
  throw new Error('expected Apply enabled after editing parentMasterListId')
}
await applyBtn.click()
await page
  .locator('.dg20-builder-editor__status')
  .filter({ hasText: /No unsaved/i })
  .waitFor()
if ((await parentEditor.inputValue()) !== 'parent-list-v2') {
  throw new Error('expected parentMasterListId persisted after Apply')
}

// Property / Bilingual isolation
await page.getByRole('tab', { name: 'Bilingual' }).click()
const errorEn = page.locator('#dg20-builder-bilingual-field-cascading_dropdown_1-errorEn')
await errorEn.fill('Only EN')
await page.locator('[data-field-id="cascading_dropdown_1"]').click()
await page.getByLabel('Required').click()
await page.getByRole('button', { name: 'Apply changes' }).click()
await page.getByRole('tab', { name: 'Bilingual' }).click()
if ((await errorEn.inputValue()) !== 'Only EN') {
  throw new Error('expected bilingual error draft preserved after Property Apply')
}

// Steps still operable
await page.getByRole('tab', { name: 'Steps' }).click()
await page.getByRole('heading', { name: /steps/i }).waitFor()

// Unavailable preview (no MasterDataAdapter) — no invented options
const preview = page.locator('.dg20-builder-preview')
const previewText = await preview.innerText()
if (!/unavailable|Master-data|options|અનુપલબ્ધ/i.test(previewText)) {
  throw new Error('expected unavailable master-data preview copy')
}
if ((await preview.locator('[data-dg20-widget="multiselect"]').count()) < 1) {
  throw new Error('expected multiselect in preview')
}
if ((await preview.locator('[data-dg20-widget="cascading-dropdown"]').count()) < 1) {
  throw new Error('expected cascading-dropdown in preview')
}

// EN/GU
await page.locator('.dg20-builder-locale-btn', { hasText: 'GU' }).click()
await page.locator('.dg20-builder-palette__item[data-widget-type="multiselect"]').click()
await page.getByTestId('configured-add-dialog').waitFor()
await page.getByTestId('configured-add-master-list-id').waitFor()
await expectVisibleGuMasterListLabel(page)
await page.getByTestId('configured-add-cancel').click()
await page.locator('.dg20-builder-locale-btn', { hasText: 'EN' }).click()

if (errors.length > 0) {
  throw new Error(`unexpected console/page errors:\n${errors.join('\n')}`)
}

console.log('FB-D10 browser verify OK at', BASE)
await browser.close()

async function expectVisibleGuMasterListLabel(page) {
  await page
    .getByTestId('configured-add-dialog')
    .locator('label', { hasText: 'માસ્ટર યાદી ID' })
    .waitFor()
}

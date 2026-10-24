/**
 * FB-D9.1 browser verify — real Playwright keyboard actions only.
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

const BASE = process.env.D91_BUILDER_URL || process.env.D9_BUILDER_URL || 'http://localhost:5173/'

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

// Open dropdown configured Add
await page.getByRole('button', { name: 'Add Master-data dropdown' }).click()
await page.getByTestId('configured-add-dialog').waitFor()
const input = page.getByTestId('configured-add-master-list-id')
await input.waitFor()
if (!(await input.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected masterListId focused on open')
}

// Type masterListId character-by-character; focus must never leave the input
const value = 'status-list'
for (const ch of value) {
  await page.keyboard.type(ch)
  const focused = await input.evaluate((el) => el === document.activeElement)
  if (!focused) {
    throw new Error(`focus left masterListId while typing "${ch}"`)
  }
}
if ((await input.inputValue()) !== value) {
  throw new Error(`expected "${value}", got "${await input.inputValue()}"`)
}

// Tab / Shift+Tab wraps within dialog
await page.keyboard.press('Tab')
if (
  !(await page
    .getByTestId('configured-add-confirm')
    .evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected Confirm focused after Tab')
}
await page.keyboard.press('Tab')
if (
  !(await page.getByTestId('configured-add-cancel').evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected Cancel focused after second Tab')
}
await page.keyboard.press('Tab')
if (!(await input.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected Tab wrap back to masterListId')
}
await page.keyboard.press('Shift+Tab')
if (
  !(await page.getByTestId('configured-add-cancel').evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected Shift+Tab wrap to Cancel')
}

// Escape restores palette focus
await page.keyboard.press('Escape')
await page.getByTestId('configured-add-dialog').waitFor({ state: 'detached' })
const paletteFocused = await page
  .locator('.dg20-builder-palette__item[data-widget-type="dropdown-master"]')
  .evaluate((el) => el === document.activeElement)
if (!paletteFocused) {
  throw new Error('expected palette dropdown-master focused after Escape')
}

// Cancel focus restoration
await page.getByRole('button', { name: 'Add Radio group' }).click()
await page.getByTestId('configured-add-cancel').click()
const radioPaletteFocused = await page
  .locator('.dg20-builder-palette__item[data-widget-type="radio"]')
  .evaluate((el) => el === document.activeElement)
if (!radioPaletteFocused) {
  throw new Error('expected palette radio focused after Cancel')
}

// Add + Confirm focuses canvas field
await page.getByRole('button', { name: 'Add Master-data dropdown' }).click()
const input2 = page.getByTestId('configured-add-master-list-id')
await input2.waitFor()
await page.keyboard.type('status-list')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="dropdown_master_1"]').waitFor()
const canvasFocused = await page
  .locator('[data-field-id="dropdown_master_1"]')
  .evaluate((el) => el === document.activeElement || el.contains(document.activeElement))
if (!canvasFocused) {
  throw new Error('expected canvas field focused after Confirm')
}

// After Cancel, Open Draft is operable again (no evaluate bypass)
await page.getByRole('button', { name: 'Add Radio group' }).click()
await page.getByTestId('configured-add-cancel').click()
await page
  .getByTestId('open-draft-panel')
  .getByLabel(/Service ID/i)
  .fill('demo-service')
await page.getByRole('button', { name: /^Load$/i }).click()
await page.locator('#dg20-builder-persist-discard').waitFor()
await page
  .locator('#dg20-builder-persist-discard')
  .getByRole('button', { name: /Cancel|રદ કરો/i })
  .click()

// EN/GU
await page.locator('.dg20-builder-locale-btn', { hasText: 'GU' }).click()
await page.locator('.dg20-builder-palette__item[data-widget-type="radio"]').click()
await page.getByTestId('configured-add-dialog').waitFor()
await page.getByTestId('configured-add-cancel').click()
await page.locator('.dg20-builder-locale-btn', { hasText: 'EN' }).click()

if (errors.length > 0) {
  throw new Error(`unexpected console/page errors:\n${errors.join('\n')}`)
}

console.log('FB-D9.1 browser verify OK at', BASE)
await browser.close()

/**
 * FB-D9 browser verify helper (superseded scenarios covered by d9.1-browser-verify.mjs).
 * Kept for regression of add/edit flows without modal-bypass hacks.
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

const BASE = process.env.D9_BUILDER_URL || 'http://localhost:5173/'

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

await page.getByRole('button', { name: 'Add Master-data dropdown' }).click()
await page.getByTestId('configured-add-dialog').waitFor()
await page.getByTestId('configured-add-cancel').click()

await page.getByRole('button', { name: 'Add Radio group' }).click()
await page.keyboard.type(' padded ')
await page.getByTestId('configured-add-confirm').click()
if (
  !(await page
    .getByTestId('configured-add-master-list-id')
    .evaluate((el) => el === document.activeElement))
) {
  throw new Error('expected masterListId focus after invalid confirm')
}
await page.getByTestId('configured-add-cancel').click()

await page.getByRole('button', { name: 'Add Master-data dropdown' }).click()
await page.keyboard.type('status-list')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="dropdown_master_1"]').waitFor()

await page.getByRole('button', { name: 'Add Radio group' }).click()
await page.keyboard.type('choice-list')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="radio_1"]').click()

const masterInput = page.getByLabel('Master list ID')
await masterInput.fill('choice-list-v2')
await page.getByRole('button', { name: 'Apply changes' }).click()
await page
  .locator('.dg20-builder-editor__status')
  .getByText(/No unsaved changes/i)
  .waitFor()

// Open Draft after Cancel — normal operable path (no evaluate bypass)
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

if (errors.length > 0) {
  throw new Error(`unexpected console/page errors:\n${errors.join('\n')}`)
}

console.log('FB-D9 browser verify OK at', BASE)
await browser.close()

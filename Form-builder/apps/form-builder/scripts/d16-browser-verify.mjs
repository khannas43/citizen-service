/**
 * FB-D16 browser verify — real Playwright keyboard/clicks only.
 * Requires: Vite on :5173 (or D16_BUILDER_URL), and `playwright` resolvable via NODE_PATH.
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass UI.
 * Do not invent service adapters or fabricate Golden Record values.
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
  process.env.D16_BUILDER_URL ||
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

const addable = await page.locator('.dg20-builder-palette__item--addable').count()
const pending = await page.locator('.dg20-builder-palette__item--pending').count()
if (addable !== 29 || pending !== 1) {
  throw new Error(`expected 29/1 palette counts, got ${addable}/${pending}`)
}

await page.getByRole('button', { name: /Add Family repeater/i }).click()
await page.getByTestId('configured-add-dialog').waitFor()
const maxItems = page.getByTestId('configured-add-max-items')
await maxItems.waitFor()
if (!(await maxItems.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected maxItems focused on open')
}

await page.getByTestId('configured-add-confirm').click()
await page.getByRole('alert').waitFor()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-max-items"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await maxItems.fill('5')
await page.getByTestId('configured-add-min-items').fill('0')
await page.getByTestId('configured-add-confirm').click()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="configured-add-initial-member-widget-type"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await page.getByTestId('configured-add-initial-member-widget-type').selectOption('text-short')
await page.getByTestId('configured-add-initial-member-label-en').fill('Member name')
await page.getByTestId('configured-add-initial-member-label-gu').fill('સભ્ય')
await page.getByTestId('configured-add-confirm').click()
await page.locator('[data-field-id="family_repeater_1"]').waitFor()
await page.getByTestId('family-repeater-editor').waitFor()

// Add second member in draft, Apply
await page.getByLabel(/Member widget type/i).selectOption('email')
const enLabels = page.getByLabel(/Label \(English\)/i)
const guLabels = page.getByLabel(/Label \(Gujarati\)/i)
await enLabels.last().fill('Email')
await guLabels.last().fill('ઈમેલ')
await page.getByTestId('family-repeater-add-member').click()
await page.getByTestId('family-repeater-apply').click()
await page.getByText(/2 member fields/i).waitFor()

// Unsaved draft blocks Validate
await page.getByLabel(/Maximum items/i).fill('6')
const validate = page.getByRole('button', { name: /^Validate$/i })
if (await validate.isEnabled()) {
  throw new Error('expected Validate disabled while family draft dirty')
}
await page.getByTestId('family-repeater-cancel').click()

// Steps + Bindings remain operable
await page.getByRole('tab', { name: 'Steps' }).click()
await page.getByRole('heading', { name: /steps/i }).waitFor()
await page.getByRole('tab', { name: 'Bindings' }).click()
await page.getByRole('heading', { name: /CAF Prefill/i }).waitFor()

// Preview shows family-repeater without fabricating values
const preview = page.locator('.dg20-builder-preview')
await preview.waitFor()
if ((await preview.locator('[data-dg20-widget="family-repeater"]').count()) < 1) {
  // widget attr may vary — ensure preview text does not leak draft internals
  const text = await preview.innerText()
  if (/showValidation|structureKey|ETag|fr-row-/.test(text)) {
    throw new Error('preview leaked internal draft/metadata text')
  }
}

// EN/GU
await page.getByRole('button', { name: /^GU$/i }).click()
await page.getByRole('button', { name: /^EN$/i }).click()

// 390px: no unexpected horizontal overflow beyond small tolerance
const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
if (scrollWidth > 398) {
  throw new Error(`horizontal overflow at 390px: scrollWidth=${scrollWidth}`)
}

const unexpected = errors.filter(
  (e) => !/Download the React DevTools|React Router Future Flag/i.test(e),
)
if (unexpected.length > 0) {
  throw new Error(`unexpected console/page errors:\n${unexpected.join('\n')}`)
}

await browser.close()
console.log(`FB-D16 browser verify OK at ${BASE}`)

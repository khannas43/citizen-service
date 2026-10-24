/**
 * FB-D17 browser verify — real Playwright keyboard/clicks only.
 * Requires: Vite on :5173 (or D17_BUILDER_URL), and `playwright` resolvable via NODE_PATH.
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass UI.
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
  process.env.D17_BUILDER_URL ||
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
if (addable !== 30 || pending !== 0) {
  throw new Error(`expected 30/0 palette counts, got ${addable}/${pending}`)
}

const pageBreak = page.getByRole('button', { name: /Create boundary \(Page break\)/i })
if (await pageBreak.isDisabled()) {
  throw new Error('expected page-break create-boundary enabled')
}

const canvasCountBefore = await page.locator('.dg20-builder-canvas [data-field-id]').count()

await pageBreak.click()
await page.getByTestId('page-break-dialog').waitFor()
const afterField = page.getByTestId('page-break-after-field')
await afterField.waitFor()
if (!(await afterField.evaluate((el) => el === document.activeElement))) {
  throw new Error('expected afterField focused on open')
}

await page.getByTestId('page-break-confirm').click()
await page.getByRole('alert').waitFor()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="page-break-label-en"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await page.getByTestId('page-break-label-en').fill('Browser Step EN')
await page.getByTestId('page-break-confirm').click()
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="page-break-label-gu"]')
  return el instanceof HTMLElement && el === document.activeElement
})

await page.getByTestId('page-break-label-gu').fill('Browser Step GU')
await page.getByTestId('page-break-confirm').click()
await page.getByTestId('page-break-dialog').waitFor({ state: 'detached' })

const canvasCountAfter = await page.locator('.dg20-builder-canvas [data-field-id]').count()
if (canvasCountAfter !== canvasCountBefore) {
  throw new Error(
    `page-break must not add canvas fields: before=${canvasCountBefore} after=${canvasCountAfter}`,
  )
}

await page.getByRole('tab', { name: 'Steps' }).waitFor()
await page
  .locator('.dg20-builder-steps__card-meta', {
    hasText: 'EN: Browser Step EN · GU: Browser Step GU',
  })
  .waitFor()
await page.locator('.dg20-renderer-step-label', { hasText: 'Browser Step EN' }).waitFor()

// Pending dialog gates: open again, assert Validate disabled, Cancel
await page.getByRole('button', { name: /Create boundary \(Page break\)/i }).click()
await page.getByTestId('page-break-dialog').waitFor()
const validate = page.getByRole('button', { name: /^Validate$/i })
if (await validate.isEnabled()) {
  throw new Error('expected Validate disabled while page-break dialog open')
}
await page.keyboard.press('Escape')
await page.getByTestId('page-break-dialog').waitFor({ state: 'detached' })

// EN/GU
await page.getByRole('button', { name: /^GU$/i }).click()
await page.getByRole('button', { name: /^EN$/i }).click()

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
console.log(`FB-D17 browser verify OK at ${BASE}`)

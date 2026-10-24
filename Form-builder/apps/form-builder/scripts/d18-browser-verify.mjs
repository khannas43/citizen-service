/**
 * FB-D18 browser verify — real Playwright keyboard/clicks only.
 * Requires: D18 mock on :8080, Vite on :5173 (or D18_BUILDER_URL), and playwright via NODE_PATH.
 * Start Vite with VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID set to a non-production technical actor.
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

const BASE = process.env.D18_BUILDER_URL || 'http://localhost:5173/'
const ACTOR_ID = process.env.VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 390, height: 844 },
})
const page = await context.newPage()
const errors = []
let lifecycleCalls = 0

page.on('pageerror', (error) => errors.push(`pageerror: ${error}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
page.on('request', (request) => {
  if (request.method() === 'POST' && request.url().includes('/lifecycle-transitions?'))
    lifecycleCalls += 1
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })

const submit = page.getByTestId('submit-button')
if (!(await submit.isDisabled()))
  throw new Error('Submit must initially be disabled for an unsaved local draft')

await page.getByRole('button', { name: /^Validate$/i }).click()
await page.waitForFunction(() => {
  const button = document.querySelector('[data-testid="save-draft-button"]')
  return button instanceof HTMLButtonElement && !button.disabled
})
await page.getByTestId('save-draft-button').click()
await page.getByTestId('persist-success').waitFor()
await page.waitForFunction(() => {
  const button = document.querySelector('[data-testid="submit-button"]')
  return button instanceof HTMLButtonElement && !button.disabled
})

await submit.click()
await page.getByTestId('submit-confirm-dialog').waitFor()
await page.keyboard.press('Escape')
await page.getByTestId('submit-confirm-dialog').waitFor({ state: 'detached' })
if (lifecycleCalls !== 0)
  throw new Error(`Escape must make zero lifecycle calls, got ${lifecycleCalls}`)

await submit.click()
await page.getByTestId('submit-confirm-dialog').waitFor()
await page.getByTestId('submit-confirm-cancel').click()
await page.getByTestId('submit-confirm-dialog').waitFor({ state: 'detached' })
if (lifecycleCalls !== 0)
  throw new Error(`Cancel must make zero lifecycle calls, got ${lifecycleCalls}`)

await submit.click()
await page.getByTestId('submit-confirm-confirm').click()
await page.getByTestId('submit-success').waitFor()
if (lifecycleCalls !== 1)
  throw new Error(`expected exactly one lifecycle call, got ${lifecycleCalls}`)

const submittedText = await page.getByTestId('submit-success').innerText()
if (!/submitted|સબમિટ/i.test(submittedText))
  throw new Error(`unexpected submit success: ${submittedText}`)
await page.getByTestId('submit-readonly-guidance').waitFor()

const paletteButtons = page.locator('.dg20-builder-palette__item--addable')
const paletteCount = await paletteButtons.count()
for (let index = 0; index < paletteCount; index += 1) {
  if (!(await paletteButtons.nth(index).isDisabled()))
    throw new Error('submitted palette button must be disabled')
}
await page.getByTestId('open-draft-panel').waitFor()

await page.getByRole('button', { name: /^GU$/i }).click()
await page.getByRole('button', { name: /^EN$/i }).click()

const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
if (scrollWidth > 398) throw new Error(`horizontal overflow at 390px: scrollWidth=${scrollWidth}`)

const bodyText = await page.locator('body').innerText()
if (ACTOR_ID && bodyText.includes(ACTOR_ID))
  throw new Error('technical actor leaked into rendered text')
if (/"[A-Za-z0-9_-]{11}"/.test(bodyText)) throw new Error('ETag token leaked into rendered text')

const unexpected = errors.filter(
  (error) => !/Download the React DevTools|React Router Future Flag/i.test(error),
)
if (unexpected.length > 0)
  throw new Error(`unexpected console/page errors:\n${unexpected.join('\n')}`)

await browser.close()
console.log(`FB-D18 browser verify OK at ${BASE}`)

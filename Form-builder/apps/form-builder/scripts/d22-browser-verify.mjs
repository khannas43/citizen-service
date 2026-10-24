/**
 * FB-D22 browser verify — consolidated Unit D acceptance path.
 *
 * Requires:
 * - D22 mock on :8080 (`node apps/form-builder/scripts/d22-acceptance-mock.mjs`)
 * - Vite Builder with VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID set
 * - playwright available via NODE_PATH
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass UI.
 * No authentication or DST delivery claim.
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

const BASE = process.env.D22_BUILDER_URL || process.env.D18_BUILDER_URL || 'http://localhost:5173/'
const ACTOR_ID = process.env.VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID
if (!ACTOR_ID) {
  console.error('Set VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID to a non-production technical actor')
  process.exit(1)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 390, height: 844 },
})
const page = await context.newPage()
const errors = []
let lifecycleCalls = 0
let cloneCalls = 0

page.on('pageerror', (error) => errors.push(`pageerror: ${error}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
page.on('request', (request) => {
  if (request.method() === 'POST' && request.url().includes('/lifecycle-transitions?')) {
    lifecycleCalls += 1
  }
  if (request.method() === 'POST' && request.url().includes('/drafts/from-version?')) {
    cloneCalls += 1
  }
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page
  .getByRole('heading', { name: /Form Builder|Builder/i })
  .first()
  .waitFor({
    timeout: 15_000,
  })

// --- Local edit ---
await page.getByRole('button', { name: 'Add Short text' }).click()
await page.getByRole('button', { name: /^Validate$/i }).click()
await page.waitForFunction(() => {
  const button = document.querySelector('[data-testid="save-draft-button"]')
  return button instanceof HTMLButtonElement && !button.disabled
})
await page.getByTestId('save-draft-button').click()
await page.getByTestId('persist-success').waitFor()

// Edit again + optional Move Down reorder (390px fallback)
const moveDown = page.getByRole('button', { name: /move down/i }).first()
if ((await moveDown.count()) > 0 && (await moveDown.isEnabled())) {
  await moveDown.click()
}

const canvas = page.locator('.dg20-builder-canvas')
const fieldButton = canvas.getByRole('button').filter({ hasText: /.+/ }).first()
if ((await fieldButton.count()) > 0) {
  await fieldButton.click()
  const label = page.getByLabel(/Label \(English\)/i)
  if ((await label.count()) > 0) {
    await label.fill('D22 acceptance rename')
    await page.getByRole('button', { name: /Apply changes/i }).click()
  }
}

await page.getByRole('button', { name: /^Validate$/i }).click()
await page.waitForFunction(() => {
  const button = document.querySelector('[data-testid="save-draft-button"]')
  return button instanceof HTMLButtonElement && !button.disabled
})
await page.getByTestId('save-draft-button').click()
await page.getByTestId('persist-success').waitFor()

// Submit confirmation Cancel/Escape then confirm
const submit = page.getByTestId('submit-button')
await page.waitForFunction(() => {
  const button = document.querySelector('[data-testid="submit-button"]')
  return button instanceof HTMLButtonElement && !button.disabled
})
await submit.click()
await page.getByTestId('submit-confirm-dialog').waitFor()
await page.keyboard.press('Escape')
await page.getByTestId('submit-confirm-dialog').waitFor({ state: 'detached' })
if (lifecycleCalls !== 0) {
  throw new Error(`Escape must make zero lifecycle calls, got ${lifecycleCalls}`)
}

await submit.click()
await page.getByTestId('submit-confirm-confirm').click()
await page.getByTestId('submit-success').waitFor()
if (lifecycleCalls !== 1) {
  throw new Error(`expected exactly one lifecycle call, got ${lifecycleCalls}`)
}
await page.getByTestId('submit-readonly-guidance').waitFor()

// Version list + clone Cancel then success
await page.getByRole('button', { name: /^Version history$/i }).click()
const panel = page.getByTestId('version-history-panel')
await panel.waitFor()
await panel.getByRole('button', { name: /^Load versions$/i }).click()
await panel.getByText('v2').waitFor()
await panel.getByText('v3').waitFor()

await panel
  .getByRole('button', { name: /create new draft/i })
  .first()
  .click()
await page.getByTestId('clone-confirm-dialog').waitFor()
await page.getByTestId('clone-confirm-cancel').click()
await page.getByTestId('clone-confirm-dialog').waitFor({ state: 'detached' })
if (cloneCalls !== 0) {
  throw new Error(`Cancel must make zero clone calls, got ${cloneCalls}`)
}

await panel
  .getByRole('button', { name: /create new draft/i })
  .first()
  .click()
await page.getByTestId('clone-confirm-dialog').waitFor()
await page.getByTestId('clone-confirm-confirm').click()
await page.getByTestId('clone-confirm-dialog').waitFor({ state: 'detached' })
if (cloneCalls !== 1) {
  throw new Error(`expected exactly one clone call, got ${cloneCalls}`)
}
await page.locator('.dg20-builder-status-badge[data-status="draft"]').waitFor()
await page.getByRole('button', { name: /Add Short text/i }).waitFor({ state: 'visible' })
if (!(await page.getByRole('button', { name: /Add Short text/i }).isEnabled())) {
  throw new Error('cloned draft must restore authoring')
}

// EN/GU
await page.getByRole('button', { name: /^GU$/i }).click()
await page.getByRole('button', { name: /^EN$/i }).click()

const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
if (scrollWidth > 398) {
  throw new Error(`horizontal overflow at 390px: scrollWidth=${scrollWidth}`)
}

// Desktop viewport
await page.setViewportSize({ width: 1280, height: 800 })
await page.getByRole('button', { name: /^Validate$/i }).waitFor()

const bodyText = await page.locator('body').innerText()
if (bodyText.includes(ACTOR_ID)) {
  throw new Error('technical actor leaked into rendered text')
}
if (/"[A-Za-z0-9_-]{11}"/.test(bodyText)) {
  throw new Error('ETag token leaked into rendered text')
}

const unexpected = errors.filter(
  (error) => !/Download the React DevTools|React Router Future Flag/i.test(error),
)
if (unexpected.length > 0) {
  throw new Error(`unexpected console/page errors:\n${unexpected.join('\n')}`)
}

await browser.close()
console.log(`FB-D22 browser verify OK at ${BASE}`)

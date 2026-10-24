/**
 * FB-D19 browser verify — requires the D19 mock on :8080 and Vite
 * with VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID configured.
 *
 * Do not use evaluate(el.click()), force-click, or programmatic focus to bypass UI.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  console.error('Install playwright and set NODE_PATH to its node_modules')
  process.exit(1)
}

const BASE = process.env.D19_BUILDER_URL || 'http://localhost:5173/'
const ACTOR_ID = process.env.VITE_FORM_BUILDER_TECHNICAL_ACTOR_ID
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
let cloneCalls = 0
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('request', (request) => {
  if (request.method() === 'POST' && request.url().includes('/drafts/from-version?')) {
    cloneCalls += 1
  }
})

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /version history/i }).click()
const panel = page.getByTestId('version-history-panel')
await panel.waitFor()
await panel.getByTestId('version-history-service-id').fill('d19-demo-service')
await panel.getByRole('button', { name: /load versions/i }).click()
await panel.getByTestId('version-row-1').waitFor()
await panel.getByTestId('version-row-2').waitFor()

await panel
  .getByRole('button', { name: /create new draft/i })
  .first()
  .click()
await page.getByTestId('clone-confirm-dialog').waitFor()
await page.keyboard.press('Escape')
await page.getByTestId('clone-confirm-dialog').waitFor({ state: 'detached' })
if (cloneCalls !== 0) {
  throw new Error(`Escape must make zero clone calls, got ${cloneCalls}`)
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
const text = await page.locator('body').innerText()
if (/"[A-Za-z0-9_-]{11}"/.test(text)) {
  throw new Error('ETag token leaked into rendered text')
}
if (ACTOR_ID && text.includes(ACTOR_ID)) {
  throw new Error('technical actor leaked into rendered text')
}
const width = await page.evaluate(() => document.documentElement.scrollWidth)
if (width > 398) {
  throw new Error(`horizontal overflow at 390px: ${width}`)
}
const unexpected = errors.filter(
  (error) => !/Download the React DevTools|React Router Future Flag/i.test(String(error)),
)
if (unexpected.length) {
  throw new Error(`unexpected browser errors:\n${unexpected.join('\n')}`)
}

await browser.close()
console.log(`FB-D19 browser verify OK at ${BASE}`)

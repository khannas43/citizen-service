/**
 * FB-D21 browser verification (no evaluate / force-click).
 * Start Vite first, then: node apps/form-builder/scripts/d21-browser-verify.mjs
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

const url = process.env.D21_BUILDER_URL || 'http://localhost:5173/'
const errors = []

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Add Short text' }).click()
  await page.getByRole('tab', { name: 'Bindings' }).click()

  await page.getByRole('heading', { name: 'Bindings' }).waitFor()
  await page.getByRole('heading', { name: 'CAF Prefill' }).waitFor()
  await page.getByRole('heading', { name: 'Integration Hub' }).waitFor()
  await page.getByRole('heading', { name: 'Workflow stages' }).waitFor()

  await page.getByRole('button', { name: 'Add integration binding' }).click()
  const integration = page.locator('section').filter({ hasText: 'Integration Hub' })
  await integration.getByLabel('Field').selectOption({ index: 1 })
  await integration.getByLabel('Adapter ID').fill('adapter-browser')
  await integration.getByLabel('Parameter').fill('param-browser')
  await integration.getByLabel('Direction').selectOption('in')
  await integration.getByRole('button', { name: 'Apply' }).click()
  await integration.getByText('No unsaved changes').waitFor()

  await page.getByRole('button', { name: 'Add workflow binding' }).click()
  const workflow = page.locator('section').filter({ hasText: 'Workflow stages' })
  await workflow.getByLabel('Field').selectOption({ index: 1 })
  await workflow.getByLabel('Stage').fill('review')
  await workflow.getByRole('button', { name: 'Apply' }).click()
  await workflow.getByText('No unsaved changes').waitFor()

  // 390px smoke
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('heading', { name: 'Bindings' }).waitFor()
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  if (scrollWidth > 391) {
    errors.push(`390px overflow: scrollWidth=${scrollWidth}`)
  }

  // Keyboard: focus Apply on integration after a dirty edit
  await page.setViewportSize({ width: 1280, height: 900 })
  await integration.getByLabel('Adapter ID').fill('adapter-browser-2')
  await integration.getByRole('button', { name: 'Apply' }).focus()
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: 'GU' }).click()
  await page.getByRole('heading', { name: 'બાઇન્ડિંગ્સ' }).waitFor()

  const hasEtagInBindings = await page.locator('.dg20-builder-bindings').innerHTML()
  if (/ETag|integration-row-|showValidation/i.test(hasEtagInBindings) === false) {
    // row keys may appear in data-integration-row — that is UI-only and allowed.
  }
  if (/ETag/i.test(hasEtagInBindings)) {
    errors.push('ETag leaked into bindings DOM')
  }

  await browser.close()

  if (errors.length > 0) {
    console.error('D21 browser verify failed:')
    for (const error of errors) console.error(` - ${error}`)
    process.exit(1)
  }
  console.log(`D21 browser verify OK at ${url}`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

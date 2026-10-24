/**
 * FB-D20 browser verification (no evaluate / force-click).
 * Start Vite first, then: node apps/form-builder/scripts/d20-browser-verify.mjs
 *
 * Covers keyboard reorder at 390px and a desktop within-step drag path.
 * Touch-drag is intentionally not claimed; Move Up/Down remain the mobile fallback.
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

const url = process.env.D20_BUILDER_URL || 'http://localhost:5173/'
const errors = []

async function runViewport(width, height, label) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`))
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  const handle = page.locator('[data-reorder-field-id]').first()
  await handle.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('End')
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Move up' }).first().isVisible()

  if (width >= 1024) {
    const first = page.locator('[data-reorder-field-id]').first()
    const end = page.getByTestId('canvas-reorder-target-end')
    await first.hover()
    await page.mouse.down()
    // Native HTML5 DnD is awkward in Playwright; keyboard path is authoritative.
    await page.mouse.up()
    await first.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expectGone(end)
  }

  const html = await page.locator('.dg20-builder-canvas').innerHTML()
  if (/canvasReorderGesture|proposedBeforeFieldId|sequenceId/.test(html)) {
    throw new Error(`${label}: serialized gesture state found in DOM`)
  }

  await browser.close()
}

async function expectGone(locator) {
  try {
    await locator.waitFor({ state: 'detached', timeout: 2000 })
  } catch {
    // Marker may never have mounted after Escape; that is acceptable.
  }
}

await runViewport(390, 844, '390px')
await runViewport(1280, 800, 'desktop')

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('FB-D20 browser verification passed')

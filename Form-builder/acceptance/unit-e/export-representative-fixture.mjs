/**
 * One-shot exporter: Unit D acceptance definition → frozen Unit E JSON + SHA-256.
 * Run: ./node_modules/.bin/vite-node --script acceptance/unit-e/export-representative-fixture.mjs
 *
 * Illustrative / non-authoritative. Not a production package API.
 */
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { UNIT_D_ACCEPTANCE_DEFINITION } from '../../apps/form-builder/acceptance/unit-d-acceptance-definition.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const def = JSON.parse(JSON.stringify(UNIT_D_ACCEPTANCE_DEFINITION))
def.serviceId = 'unit-e-technical-acceptance'
def.version = 1
def.status = 'draft'
def.audit = {
  createdBy: 'unit-e-technical-actor',
  createdAt: '2026-07-27T00:00:00.000Z',
}

const json = `${JSON.stringify(def, null, 2)}\n`
const sha = createHash('sha256').update(json).digest('hex')

const outDir = join(root, 'acceptance/unit-e')
const javaDir = join(root, 'services/form-definition-service/src/test/resources/acceptance')
const officerDir = join(root, '../officer-portal/src/acceptance/unit-e')
const citizenDir = join(root, '../citizen-portal/src/acceptance/unit-e')
mkdirSync(outDir, { recursive: true })
mkdirSync(javaDir, { recursive: true })
mkdirSync(officerDir, { recursive: true })
mkdirSync(citizenDir, { recursive: true })

writeFileSync(join(outDir, 'unit-e-representative-definition.json'), json)
writeFileSync(join(javaDir, 'unit-e-representative-definition.json'), json)
writeFileSync(join(officerDir, 'unit-e-representative-definition.json'), json)
writeFileSync(join(citizenDir, 'unit-e-representative-definition.json'), json)
writeFileSync(join(outDir, 'unit-e-representative-definition.sha256'), `${sha}\n`)
writeFileSync(join(officerDir, 'unit-e-representative-definition.sha256'), `${sha}\n`)
writeFileSync(join(citizenDir, 'unit-e-representative-definition.sha256'), `${sha}\n`)
copyFileSync(join(outDir, 'contract-manifest.json'), join(officerDir, 'contract-manifest.json'))
copyFileSync(join(outDir, 'contract-manifest.json'), join(citizenDir, 'contract-manifest.json'))

console.log(`OK sha256=${sha}`)
console.log(`widgets=${def.meta.paletteProvenance.map((p) => p.widgetType).join(',')}`)
console.log(`steps=${def.meta.progressiveSteps.length}`)
console.log(
  `bindings prefill/int/wf=${[
    def.meta.prefillBindings.length,
    def.meta.integrationBindings.length,
    def.meta.workflowBindings.length,
  ].join('/')}`,
)

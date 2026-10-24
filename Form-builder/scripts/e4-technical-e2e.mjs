#!/usr/bin/env node
/**
 * FB-E4 technical end-to-end verifier (bounded).
 *
 * Proves package-level technical acceptance against real FDS + PostgreSQL
 * (Testcontainers / Rancher Desktop Docker). Never silently falls back to a
 * mock while claiming live acceptance.
 *
 * Usage (from Form-builder/):
 *   node scripts/e4-technical-e2e.mjs
 *
 * Optional env:
 *   E4_SKIP_PORTAL_TESTS=1   — skip officer/citizen vitest slices
 *   E4_SKIP_BROWSER=1        — skip optional browser checks (default skip)
 *   E4_TIMEOUT_MS=1200000    — overall timeout
 *
 * NON-CLAIMS: production IAM, DST, deployment, §5 live-service, catalogue mapping.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FORM_BUILDER = join(here, '..')
const ROOT = join(FORM_BUILDER, '..')
const OFFICER = join(ROOT, 'officer-portal')
const CITIZEN = join(ROOT, 'citizen-portal')
const FIXTURE = join(FORM_BUILDER, 'acceptance/unit-e/unit-e-representative-definition.json')
const EXPECTED_SHA = '8847a0904c402b7b98822f96741234a0f93230d57f7ecf458f41b66e979c557e'

const TIMEOUT_MS = Number(process.env.E4_TIMEOUT_MS || 1_200_000)
const SKIP_PORTALS = process.env.E4_SKIP_PORTAL_TESTS === '1'
const RUN_BROWSER = process.env.E4_SKIP_BROWSER === '0'

const children = new Set()
let timedOut = false

function log(msg) {
  process.stdout.write(`[e4-technical-e2e] ${msg}\n`)
}

function fail(msg, code = 1) {
  process.stderr.write(`[e4-technical-e2e] FAIL: ${msg}\n`)
  cleanup(code)
}

function cleanup(code) {
  for (const child of children) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => cleanup(130))
process.on('SIGTERM', () => cleanup(143))

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? FORM_BUILDER,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    children.add(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stdout += text
      if (options.forward) process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stderr += text
      if (options.forward) process.stderr.write(text)
    })
    child.on('error', (error) => {
      children.delete(child)
      reject(error)
    })
    child.on('close', (code) => {
      children.delete(child)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

async function assertDockerAvailable() {
  const result = await run('docker', ['info'], { forward: false })
  if (result.code !== 0) {
    fail(
      'Docker/Rancher Desktop is unavailable. Unit E live FDS acceptance requires PostgreSQL via Testcontainers. Install/start Rancher Desktop (or Docker) and retry. Refusing to claim live acceptance with mocks.',
    )
  }
  log('Docker daemon available')
}

function assertFixture() {
  if (!existsSync(FIXTURE)) {
    fail(`missing representative fixture: ${FIXTURE}`)
  }
  const sha = createHash('sha256').update(readFileSync(FIXTURE)).digest('hex')
  if (sha !== EXPECTED_SHA) {
    fail(`Unit E fixture SHA drift: ${sha} !== ${EXPECTED_SHA}`)
  }
  log(`fixture SHA-256 ok (${EXPECTED_SHA.slice(0, 12)}…)`)
}

async function runMavenUnitE() {
  log('Running FormDefinitionUnitEAcceptanceIT (real FDS + Testcontainers PostgreSQL)…')
  const result = await run(
    'mvn',
    [
      '-f',
      'services/form-definition-service/pom.xml',
      '-Dtest=FormDefinitionUnitEAcceptanceIT',
      'test',
    ],
    { forward: true },
  )
  if (result.code !== 0) {
    fail('Maven FormDefinitionUnitEAcceptanceIT failed — live FDS acceptance did not pass')
  }
  log('Maven Unit E IT passed')
}

async function runPortalTests() {
  if (SKIP_PORTALS) {
    log('Skipping portal tests (E4_SKIP_PORTAL_TESTS=1)')
    return
  }
  log('Running officer-portal E2/E2.1/E4 focused tests…')
  let result = await run(
    'npm',
    [
      'run',
      'test:run',
      '--',
      'src/form-definition-governance',
      'src/acceptance/e4-unit-e-acceptance.test.jsx',
    ],
    { cwd: OFFICER, forward: true },
  )
  if (result.code !== 0) fail('officer-portal E4 focused tests failed')

  log('Running citizen-portal E3/E3.1/E3.1.1/E4 focused tests…')
  result = await run(
    'npm',
    ['run', 'test:run', '--', 'src/published-form', 'src/acceptance/e4-unit-e-acceptance.test.jsx'],
    { cwd: CITIZEN, forward: true },
  )
  if (result.code !== 0) fail('citizen-portal E4 focused tests failed')
  log('Portal focused tests passed')
}

async function main() {
  const timer = setTimeout(() => {
    timedOut = true
    fail(`timed out after ${TIMEOUT_MS}ms`, 124)
  }, TIMEOUT_MS)
  timer.unref?.()

  log('Unit E package acceptance is TECHNICAL ONLY')
  log('Governance queue is FDS status-derived — NOT DST')
  log('governance-technical profile is NON-PRODUCTION')
  log('§5 authoritative live-service acceptance remains OPEN')

  assertFixture()
  await assertDockerAvailable()
  await runMavenUnitE()
  await runPortalTests()

  if (RUN_BROWSER) {
    log(
      'Browser verification requested but optional harness is not started by default in this bounded script.',
    )
    log('Use officer e2:verify / citizen e3:verify separately when a browser runtime is available.')
  } else {
    log(
      'Browser verification skipped (optional). Set E4_SKIP_BROWSER=0 to acknowledge optional browser path.',
    )
  }

  clearTimeout(timer)
  if (timedOut) return
  log('PASS — Unit E technical e2e verifier completed (no mock fallback)')
  cleanup(0)
}

main().catch((error) => {
  fail(error?.stack || String(error))
})

/**
 * FB-E5.1.1 — Form Definition Service container smoke core (injectable lifecycle).
 *
 * Exported for deterministic unit tests. CLI entry: ../e5.1-fds-container-smoke.mjs
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const FORM_BUILDER = join(here, '..')
export const SERVICE_DIR = join(FORM_BUILDER, 'services/form-definition-service')
export const FIXTURE = join(FORM_BUILDER, 'acceptance/unit-e/unit-e-representative-definition.json')
export const IMAGE = 'dg20/form-definition-service:e5.1-local'
export const HEALTH_PATH = '/form-definition-service/actuator/health'
export const VALIDATION_PATH = '/form-definition-service/api/v1/form-definitions/validation'
export const GOV_QUEUE_PATH = '/form-definition-service/api/v1/form-definitions/governance/queue'

export function createDefaultRunIds(random = randomBytes) {
  const runId = random(4).toString('hex')
  return {
    runId,
    network: `dg20-e51-net-${runId}`,
    pgName: `dg20-e51-pg-${runId}`,
    fdsName: `dg20-e51-fds-${runId}`,
    pgDb: 'egov_db',
    pgUser: `e51_user_${runId}`,
    pgPass: `e51_${random(12).toString('hex')}_testonly`,
  }
}

export function createSpawnRunner(options = {}) {
  const formBuilder = options.formBuilder ?? FORM_BUILDER
  const envFactory = options.envFactory ?? defaultDockerEnv

  return function run(command, args, runOptions = {}) {
    return new Promise((resolve) => {
      let child
      try {
        child = spawn(command, args, {
          cwd: runOptions.cwd ?? formBuilder,
          env: { ...envFactory(), ...(runOptions.env || {}) },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
        })
      } catch (error) {
        resolve({
          code: 127,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
        })
        return
      }
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString('utf8')
        stdout += text
        if (runOptions.forward) process.stdout.write(text)
      })
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8')
        stderr += text
        if (runOptions.forward) process.stderr.write(text)
      })
      child.on('error', (error) => {
        resolve({
          code: 127,
          stdout,
          stderr: error instanceof Error ? error.message : String(error),
        })
      })
      child.on('close', (code) => {
        resolve({ code: code ?? 1, stdout, stderr })
      })
    })
  }
}

function defaultDockerEnv() {
  const env = { ...process.env }
  const rdSock = join(homedir(), '.rd/docker.sock')
  if (!env.DOCKER_HOST && existsSync(rdSock)) {
    env.DOCKER_HOST = `unix://${rdSock}`
  }
  return env
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((err) => (err ? reject(err) : resolve(port)))
    })
    server.on('error', reject)
  })
}

/**
 * @param {object} deps injectable collaborators for unit tests
 */
export function createSmokeSession(deps = {}) {
  const ids = deps.ids ?? createDefaultRunIds()
  const log =
    deps.log ??
    ((msg) => {
      process.stdout.write(`[e5.1-fds-container-smoke] ${msg}\n`)
    })
  const logErr =
    deps.logErr ??
    ((msg) => {
      process.stderr.write(`[e5.1-fds-container-smoke] FAIL: ${msg}\n`)
    })
  const run = deps.run ?? createSpawnRunner()
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const freePortImpl = deps.freePort ?? freePort
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const now = deps.now ?? (() => Date.now())
  const timeoutMs = deps.timeoutMs ?? Number(process.env.E51_TIMEOUT_MS || 900_000)
  const healthTimeoutMs = deps.healthTimeoutMs ?? 180_000
  const healthIntervalMs = deps.healthIntervalMs ?? 2000
  const exists = deps.existsSync ?? existsSync
  const readFile = deps.readFileSync ?? readFileSync
  const setTimeoutImpl = deps.setTimeoutImpl ?? setTimeout
  const clearTimeoutImpl = deps.clearTimeoutImpl ?? clearTimeout

  const abort = { signalled: false, reason: null, codeHint: undefined }
  const workController = deps.workController ?? new AbortController()
  const fetchAttemptTimeoutMs = deps.fetchAttemptTimeoutMs ?? 5_000
  let cleanupPromise = null
  let cleanupCalls = 0
  let completedChecks = {
    health: false,
    flyway: false,
    validation: false,
    governance: false,
    security: false,
    shutdown: false,
  }

  function abortWork(reason, codeHint) {
    abort.signalled = true
    abort.reason = reason
    if (typeof codeHint === 'number') abort.codeHint = codeHint
    try {
      if (!workController.signal.aborted) {
        workController.abort(reason || 'aborted')
      }
    } catch {
      /* AbortController.abort is best-effort */
    }
  }

  function fetchSignal(attemptMs = fetchAttemptTimeoutMs) {
    const signals = [workController.signal]
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      signals.push(AbortSignal.timeout(attemptMs))
    }
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
      return AbortSignal.any(signals)
    }
    return workController.signal
  }

  async function docker(args, options = {}) {
    const result = await run('docker', args, options)
    if (options.allowFail) return result
    if (result.code !== 0) {
      throw new Error(
        `docker ${args.join(' ')} failed (${result.code}): ${sanitize(result.stderr || result.stdout)}`,
      )
    }
    return result
  }

  function sanitize(text) {
    return String(text || '')
      .replaceAll(ids.pgPass, '[redacted]')
      .replace(/e51_[a-f0-9]+_testonly/gi, '[redacted]')
  }

  function throwIfAborted() {
    if (abort.signalled) {
      const err = new Error(abort.reason || 'aborted')
      err.code = 'ABORTED'
      throw err
    }
  }

  async function cleanup() {
    if (cleanupPromise) return cleanupPromise
    cleanupPromise = (async () => {
      cleanupCalls += 1
      log('Cleaning temporary containers/network (scoped to this run only)…')
      await docker(['rm', '-f', ids.fdsName], { allowFail: true })
      await docker(['rm', '-f', ids.pgName], { allowFail: true })
      await docker(['network', 'rm', ids.network], { allowFail: true })
    })()
    return cleanupPromise
  }

  async function waitFor(fn, label, timeout, interval) {
    const start = now()
    let last = ''
    while (now() - start < timeout) {
      throwIfAborted()
      try {
        const ok = await fn()
        if (ok) return
      } catch (error) {
        last = error instanceof Error ? error.message : String(error)
      }
      await sleep(interval)
    }
    throw new Error(`timeout waiting for ${label}${last ? `: ${sanitize(last)}` : ''}`)
  }

  async function assertDocker() {
    const info = await run('docker', ['info'])
    if (info.code !== 0) {
      throw new Error(
        'Docker/Rancher Desktop unavailable. Set DOCKER_HOST=unix://$HOME/.rd/docker.sock and start Rancher Desktop. Refusing mock fallback.',
      )
    }
    log('Docker daemon available')
  }

  async function buildImage() {
    throwIfAborted()
    log(`Building ${IMAGE}…`)
    // FB-E5.5.1: Dockerfile no longer accepts unverifiable BUILD_DATE/VCS_REF labels.
    await docker(['build', '-t', IMAGE, '-f', join(SERVICE_DIR, 'Dockerfile'), SERVICE_DIR], {
      forward: true,
    })
    log('Image build complete')
  }

  async function startPostgres() {
    throwIfAborted()
    log(`Starting ephemeral Postgres ${ids.pgName}…`)
    await docker(['network', 'create', ids.network])
    await docker([
      'run',
      '-d',
      '--name',
      ids.pgName,
      '--network',
      ids.network,
      '--network-alias',
      'postgres',
      '-e',
      `POSTGRES_DB=${ids.pgDb}`,
      '-e',
      `POSTGRES_USER=${ids.pgUser}`,
      '-e',
      `POSTGRES_PASSWORD=${ids.pgPass}`,
      'postgres:16-alpine',
    ])
    await waitFor(
      async () => {
        const result = await docker(
          ['exec', ids.pgName, 'pg_isready', '-U', ids.pgUser, '-d', ids.pgDb],
          { allowFail: true },
        )
        return result.code === 0
      },
      'postgres readiness',
      deps.postgresTimeoutMs ?? 120_000,
      healthIntervalMs,
    )
    log('PostgreSQL is ready')
  }

  async function startFds(hostPort) {
    throwIfAborted()
    const jdbc = `jdbc:postgresql://postgres:5432/${ids.pgDb}`
    log(
      `Starting FDS ${ids.fdsName} on localhost:${hostPort} (read-only root, non-root, no governance-technical)…`,
    )
    await docker([
      'run',
      '-d',
      '--name',
      ids.fdsName,
      '--network',
      ids.network,
      '-p',
      `127.0.0.1:${hostPort}:8080`,
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      '--security-opt',
      'no-new-privileges:true',
      '--cap-drop',
      'ALL',
      '-e',
      `SPRING_DATASOURCE_URL=${jdbc}`,
      '-e',
      `SPRING_DATASOURCE_USERNAME=${ids.pgUser}`,
      '-e',
      `SPRING_DATASOURCE_PASSWORD=${ids.pgPass}`,
      IMAGE,
    ])
  }

  async function pollHealth(baseUrl) {
    await waitFor(
      async () => {
        const response = await fetchImpl(`${baseUrl}${HEALTH_PATH}`, {
          cache: 'no-store',
          signal: fetchSignal(),
        })
        if (!response.ok) return false
        const body = await response.json()
        return body.status === 'UP'
      },
      'FDS actuator health UP',
      healthTimeoutMs,
      healthIntervalMs,
    )
    completedChecks.health = true
    log('Health endpoint UP')
  }

  async function assertFlyway() {
    throwIfAborted()
    const result = await docker([
      'exec',
      '-e',
      `PGPASSWORD=${ids.pgPass}`,
      ids.pgName,
      'psql',
      '-U',
      ids.pgUser,
      '-d',
      ids.pgDb,
      '-At',
      '-c',
      'SELECT version FROM form_definition.flyway_schema_history ORDER BY installed_rank',
    ])
    const versions = result.stdout
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const expected = ['1', '2', '3', '4']
    if (JSON.stringify(versions) !== JSON.stringify(expected)) {
      throw new Error(`Flyway versions expected ${expected.join(',')}, got ${versions.join(',')}`)
    }
    completedChecks.flyway = true
    log('Flyway V1–V4 applied')
  }

  async function assertValidation(baseUrl) {
    throwIfAborted()
    if (!exists(FIXTURE)) {
      throw new Error(`missing Unit E fixture: ${FIXTURE}`)
    }
    const fixture = readFile(FIXTURE, 'utf8')
    const response = await fetchImpl(`${baseUrl}${VALIDATION_PATH}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: fixture,
      cache: 'no-store',
      signal: fetchSignal(30_000),
    })
    if (!response.ok) {
      throw new Error(`validation HTTP ${response.status}`)
    }
    const body = await response.json()
    if (body.valid !== true) {
      throw new Error(`validation not valid: ${JSON.stringify(body).slice(0, 400)}`)
    }
    completedChecks.validation = true
    log('Validation endpoint accepted Unit E representative fixture')
  }

  async function assertFailClosedGovernance(baseUrl) {
    throwIfAborted()
    const response = await fetchImpl(`${baseUrl}${GOV_QUEUE_PATH}`, {
      cache: 'no-store',
      signal: fetchSignal(),
    })
    if (response.status !== 401) {
      throw new Error(`governance queue expected 401, got ${response.status}`)
    }
    const body = await response.json()
    if (body.code !== 'governance_unauthenticated') {
      throw new Error(`expected governance_unauthenticated, got ${JSON.stringify(body)}`)
    }
    const text = JSON.stringify(body)
    if (/governance-technical|APPROVE_FORM_DEFINITION|actorId/i.test(text)) {
      throw new Error('governance error body leaked technical principal/capabilities')
    }
    completedChecks.governance = true
    log('Governance queue fail-closed: 401 governance_unauthenticated')
  }

  async function assertContainerSecurity() {
    throwIfAborted()
    const inspect = await docker(['inspect', ids.fdsName])
    const [cfg] = JSON.parse(inspect.stdout)
    const user = cfg.Config?.User || ''
    if (!user.startsWith('10001')) {
      throw new Error(`expected User 10001, got ${JSON.stringify(user)}`)
    }
    const execUser = await docker(['exec', ids.fdsName, 'id', '-u'])
    if (execUser.stdout.trim() !== '10001') {
      throw new Error(`effective UID expected 10001, got ${execUser.stdout.trim()}`)
    }
    if (cfg.HostConfig?.ReadonlyRootfs !== true) {
      throw new Error('ReadonlyRootfs not enabled')
    }
    const mounts = cfg.Mounts || []
    if (
      mounts.some(
        (m) => m.Source === '/var/run/docker.sock' || String(m.Destination).includes('docker.sock'),
      )
    ) {
      throw new Error('Docker socket must not be mounted')
    }
    if (mounts.some((m) => m.Type === 'bind' && !String(m.Destination).startsWith('/tmp'))) {
      throw new Error(`unexpected host bind mount: ${JSON.stringify(mounts)}`)
    }
    const imageInspect = await docker(['inspect', IMAGE])
    const [image] = JSON.parse(imageInspect.stdout)
    const imageEnv = (image.Config?.Env || []).join('\n')
    if (
      /SPRING_DATASOURCE_PASSWORD|POSTGRES_PASSWORD|governance-technical|GOVERNANCE_TECHNICAL/i.test(
        imageEnv,
      )
    ) {
      throw new Error('image Config.Env contains forbidden credential/profile material')
    }
    if (imageEnv.includes(ids.pgPass)) {
      throw new Error('test DB password leaked into image environment')
    }
    const history = await docker(['history', '--no-trunc', IMAGE])
    if (
      history.stdout.includes(ids.pgPass) ||
      /SPRING_DATASOURCE_PASSWORD=/i.test(history.stdout)
    ) {
      throw new Error('credential material found in image history')
    }
    const containerEnv = (cfg.Config?.Env || []).join('\n')
    if (/SPRING_PROFILES_ACTIVE=.*governance-technical/.test(containerEnv)) {
      throw new Error('governance-technical profile is active on container')
    }
    completedChecks.security = true
    log(
      'Container security assertions passed (non-root, read-only, no socket, no embedded secrets)',
    )
  }

  async function assertSigtermShutdown() {
    throwIfAborted()
    log('Sending SIGTERM via docker stop (bounded)…')
    const start = now()
    const result = await docker(['stop', '-t', '20', ids.fdsName])
    const elapsed = now() - start
    if (result.code !== 0) {
      throw new Error(`docker stop failed: ${sanitize(result.stderr)}`)
    }
    if (elapsed > 25_000) {
      throw new Error(`shutdown exceeded bound (${elapsed}ms)`)
    }
    const inspect = await docker(['inspect', ids.fdsName])
    const [cfg] = JSON.parse(inspect.stdout)
    if (cfg.State?.Running) {
      throw new Error('container still running after SIGTERM stop')
    }
    await docker(['rm', '-f', ids.fdsName], { allowFail: true })
    completedChecks.shutdown = true
    log(`Bounded shutdown confirmed in ${elapsed}ms`)
  }

  async function inspectImageReport() {
    throwIfAborted()
    const inspect = await docker(['inspect', IMAGE])
    const [image] = JSON.parse(inspect.stdout)
    const javaVer = await docker(['run', '--rm', '--entrypoint', 'java', IMAGE, '-version'])
    const javaLine = (javaVer.stderr || javaVer.stdout).trim().split('\n')[0] || 'unknown'
    const scanners = []
    for (const [name, args] of [
      ['docker scout', ['scout', 'version']],
      ['trivy', ['trivy', '--version']],
      ['syft', ['syft', 'version']],
      ['grype', ['grype', 'version']],
    ]) {
      const probe =
        name === 'docker scout' ? await run('docker', args) : await run(args[0], args.slice(1))
      scanners.push({ name, available: probe.code === 0 })
    }
    return {
      image: IMAGE,
      architecture: image.Architecture,
      sizeBytes: image.Size,
      sizeMiB: (image.Size / (1024 * 1024)).toFixed(1),
      user: image.Config?.User,
      exposedPorts: image.Config?.ExposedPorts,
      entrypoint: image.Config?.Entrypoint,
      java: javaLine,
      jar: '/app/app.jar',
      labels: image.Config?.Labels || {},
      scanners,
    }
  }

  /**
   * Run the full smoke lifecycle. Resolves with exit code; does not call process.exit.
   */
  async function runSmoke() {
    let exitCode = 1
    let wroteSummary = false
    let timedOut = false

    const timer = setTimeoutImpl(() => {
      timedOut = true
      abortWork(`timed out after ${timeoutMs}ms`, 124)
    }, timeoutMs)
    // Keep timeout referenced until completion (do NOT unref).

    log('FB-E5.1 local container smoke — no deploy, no push, no Helm/portal changes')
    log('governance-technical remains PROHIBITED in production and is not activated here')

    try {
      await assertDocker()
      await buildImage()
      const report = await inspectImageReport()
      log(
        `Image ${report.image} arch=${report.architecture} size=${report.sizeMiB}MiB user=${report.user} java=${report.java}`,
      )
      for (const scanner of report.scanners) {
        log(
          `Scanner ${scanner.name}: ${scanner.available ? 'available' : 'unavailable (external)'}`,
        )
      }

      await startPostgres()
      const hostPort = await freePortImpl()
      await startFds(hostPort)
      const baseUrl = `http://127.0.0.1:${hostPort}`

      await pollHealth(baseUrl)
      await assertFlyway()
      await assertValidation(baseUrl)
      await assertFailClosedGovernance(baseUrl)
      await assertContainerSecurity()
      await assertSigtermShutdown()

      if (!(
        completedChecks.health &&
        completedChecks.flyway &&
        completedChecks.validation &&
        completedChecks.governance &&
        completedChecks.security &&
        completedChecks.shutdown
      )) {
        throw new Error('smoke returned before all required checks completed')
      }

      log(
        `SUMMARY ${JSON.stringify({
          image: report.image,
          architecture: report.architecture,
          sizeMiB: report.sizeMiB,
          user: report.user,
          entrypoint: report.entrypoint,
          java: report.java,
          jar: report.jar,
          labels: report.labels,
          scanners: report.scanners,
          health: 'UP',
          flyway: ['1', '2', '3', '4'],
          governance: '401 governance_unauthenticated',
          pushed: false,
          deployed: false,
        })}`,
      )
      wroteSummary = true
      log('PASS — FDS container smoke completed')
      exitCode = 0
    } catch (error) {
      if (timedOut) {
        exitCode = 124
      } else if (abort.signalled) {
        exitCode =
          typeof abort.codeHint === 'number'
            ? abort.codeHint
            : abort.reason?.includes('SIGINT')
              ? 130
              : abort.reason?.includes('SIGTERM')
                ? 143
                : 1
      } else {
        exitCode = 1
      }
      const message = error instanceof Error ? error.message : String(error)
      logErr(sanitize(message))
      if (wroteSummary) {
        // Should never happen; guard against misleading success markers on failure paths.
        wroteSummary = false
      }
    } finally {
      clearTimeoutImpl(timer)
      await cleanup()
    }

    return {
      exitCode,
      cleanupCalls,
      completedChecks: { ...completedChecks },
      wroteSummary,
      ids,
    }
  }

  function requestAbort(reason, codeHint) {
    abortWork(reason, codeHint)
  }

  return {
    ids,
    runSmoke,
    cleanup,
    requestAbort,
    getCleanupCalls: () => cleanupCalls,
    getCompletedChecks: () => ({ ...completedChecks }),
    /** @internal test helper */
    _abort: abort,
  }
}

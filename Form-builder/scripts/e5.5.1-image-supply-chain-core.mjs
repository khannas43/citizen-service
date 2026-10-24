/**
 * FB-E5.5.1 — FDS image supply-chain verification core (injectable lifecycle).
 *
 * Builds a local final runtime image, inspects it, generates an SPDX SBOM and CVE
 * report via Docker Scout, and cleans only run-scoped temporary resources.
 * Never pushes. Never removes unrelated Docker resources.
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const FORM_BUILDER = join(here, '..')
export const SERVICE_DIR = join(FORM_BUILDER, 'services/form-definition-service')
export const DOCKERFILE = join(SERVICE_DIR, 'Dockerfile')

/** Official index digests pinned in the Dockerfile (resolved 2026-07-29). */
export const PINNED_BASES = Object.freeze({
  build: {
    name: 'maven',
    tag: '3.9.9-eclipse-temurin-17',
    digest: 'sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc',
    reference:
      'maven:3.9.9-eclipse-temurin-17@sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc',
    resolvedAt: '2026-07-29',
    expectedPlatforms: ['linux/amd64', 'linux/arm64'],
  },
  runtime: {
    name: 'eclipse-temurin',
    tag: '17-jre-jammy',
    digest: 'sha256:475d8e96b4b2bfe08999e5e854755c773af1581acdf959a4545d88f0696a2339',
    reference:
      'eclipse-temurin:17-jre-jammy@sha256:475d8e96b4b2bfe08999e5e854755c773af1581acdf959a4545d88f0696a2339',
    resolvedAt: '2026-07-29',
    expectedPlatforms: ['linux/amd64', 'linux/arm64'],
  },
})

export const EXPECTED_USER = '10001:10001'
export const EXPECTED_ENTRYPOINT = Object.freeze(['java', '-jar', '/app/app.jar'])
export const FORBIDDEN_ENV_SUBSTRINGS = Object.freeze([
  'SPRING_PROFILES_ACTIVE=governance-technical',
  'governance-technical',
  'SPRING_DATASOURCE_PASSWORD=',
  'PASSWORD=',
  'CLIENT_SECRET=',
  'FDS_OIDC_',
])

export function createDefaultRunIds(random = randomBytes) {
  const runId = random(4).toString('hex')
  return {
    runId,
    imageTag: `dg20/form-definition-service:e5.5.1-local-${runId}`,
    outputDirName: `dg20-e551-${runId}`,
  }
}

export function createSpawnRunner(options = {}) {
  const formBuilder = options.formBuilder ?? FORM_BUILDER
  const envFactory = options.envFactory ?? defaultDockerEnv

  return function run(command, args, runOptions = {}) {
    return new Promise((resolve) => {
      let child
      const signal = runOptions.signal
      try {
        child = spawn(command, args, {
          cwd: runOptions.cwd ?? formBuilder,
          env: { ...envFactory(), ...(runOptions.env || {}) },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
          signal,
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

/**
 * Redact home paths, DOCKER_HOST, auth-looking tokens, and common secret patterns.
 */
export function sanitizeText(text, extras = []) {
  let out = String(text || '')
  for (const extra of extras) {
    if (extra) out = out.split(extra).join('[redacted]')
  }
  const home = homedir()
  if (home) out = out.split(home).join('[home]')
  out = out.replace(/unix:\/\/[^\s"']+/g, 'unix://[docker-socket]')
  out = out.replace(/DOCKER_HOST=\S+/g, 'DOCKER_HOST=[redacted]')
  out = out.replace(
    /("?(?:password|secret|token|authorization)"?\s*[:=]\s*")([^"]+)(")/gi,
    '$1[redacted]$3',
  )
  out = out.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  return out
}

export function parseScoutVersionText(text) {
  const raw = String(text || '')
  const match = raw.match(/version:\s*(v?[\d.]+[^\n]*)/i)
  if (match) return match[1].trim()
  const line = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^v?\d+\.\d+/.test(l) && l.length < 80)
  return line || 'unknown'
}

export function isScoutAuthRequiredMessage(text) {
  const t = String(text || '').toLowerCase()
  return (
    t.includes('log in with your docker id') ||
    t.includes('docker login') ||
    (t.includes('personal access token') && t.includes('scout'))
  )
}

export function parseSpdxDocument(raw) {
  let doc
  try {
    doc = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (error) {
    const err = new Error(
      `Malformed SBOM JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
    err.code = 'SBOM_MALFORMED'
    throw err
  }
  const spdxVersion = doc.spdxVersion || doc.SPDXVersion
  const packages = doc.packages || doc.Packages
  if (!spdxVersion || typeof spdxVersion !== 'string') {
    const err = new Error('SBOM missing spdxVersion')
    err.code = 'SBOM_INVALID'
    throw err
  }
  if (!Array.isArray(packages) || packages.length < 1) {
    const err = new Error('SBOM missing packages[]')
    err.code = 'SBOM_INVALID'
    throw err
  }
  return {
    format: 'spdx-json',
    spdxVersion,
    name: doc.name || doc.documentName || '',
    packageCount: packages.length,
    document: doc,
  }
}

/**
 * Count severities from Docker Scout SARIF or a simplified severity map fixture.
 */
export function countSeveritiesFromSarif(raw) {
  let doc
  try {
    doc = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (error) {
    const err = new Error(
      `Malformed CVE report JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
    err.code = 'CVE_MALFORMED'
    throw err
  }

  const counts = { critical: 0, high: 0, medium: 0, low: 0, unspecified: 0, other: 0 }

  if (doc && doc.severities && typeof doc.severities === 'object') {
    for (const key of Object.keys(counts)) {
      counts[key] = Number(doc.severities[key] || 0)
    }
    return counts
  }

  const runs = Array.isArray(doc.runs) ? doc.runs : []
  for (const run of runs) {
    const rules = new Map()
    for (const rule of run.tool?.driver?.rules || []) {
      rules.set(rule.id, rule)
    }
    for (const result of run.results || []) {
      const rule = rules.get(result.ruleId) || {}
      const props = {
        ...(rule.properties || {}),
        ...(result.properties || {}),
      }
      const severity = String(
        props.cvssV3_severity ||
          props.severity ||
          props['security-severity'] ||
          result.level ||
          'unspecified',
      )
        .toLowerCase()
        .replace(/[^a-z]/g, '')
      if (severity === 'critical' || severity === 'error') counts.critical += 1
      else if (severity === 'high') counts.high += 1
      else if (severity === 'medium' || severity === 'warning') counts.medium += 1
      else if (severity === 'low' || severity === 'note') counts.low += 1
      else if (severity === 'unspecified' || severity === 'none') counts.unspecified += 1
      else counts.other += 1
    }
  }
  return counts
}

export function evaluateCvePolicy(counts, options = {}) {
  const allowCriticalWaiver = options.allowCriticalWaiver === true
  const critical = Number(counts.critical || 0)
  const high = Number(counts.high || 0)
  if (critical > 0 && !allowCriticalWaiver) {
    return {
      acceptance: 'BLOCKED',
      exitCode: 1,
      reason: `${critical} unwaived critical finding(s)`,
    }
  }
  return {
    acceptance: high > 0 ? 'PASS_WITH_HIGH_FINDINGS' : 'PASS',
    exitCode: 0,
    reason:
      high > 0
        ? `${high} high finding(s) reported; ownership required (not waived)`
        : 'no critical findings',
  }
}

export function assertImageInspection(inspect, expectations = {}) {
  const expectedUser = expectations.user ?? EXPECTED_USER
  const expectedEntrypoint = expectations.entrypoint ?? EXPECTED_ENTRYPOINT
  const config = inspect?.Config || {}
  const user = String(config.User || '')
  if (user !== expectedUser) {
    const err = new Error(`Image user mismatch: got ${user || '(empty)'}, expected ${expectedUser}`)
    err.code = 'INSPECT_MISMATCH'
    throw err
  }
  const entrypoint = config.Entrypoint || []
  if (
    !Array.isArray(entrypoint) ||
    entrypoint.length !== expectedEntrypoint.length ||
    expectedEntrypoint.some((v, i) => entrypoint[i] !== v)
  ) {
    const err = new Error(
      `Entrypoint mismatch: got ${JSON.stringify(entrypoint)}, expected ${JSON.stringify(expectedEntrypoint)}`,
    )
    err.code = 'INSPECT_MISMATCH'
    throw err
  }
  const exposed = config.ExposedPorts || {}
  if (!Object.prototype.hasOwnProperty.call(exposed, '8080/tcp')) {
    const err = new Error('Image does not expose 8080/tcp')
    err.code = 'INSPECT_MISMATCH'
    throw err
  }
  const env = Array.isArray(config.Env) ? config.Env : []
  for (const line of env) {
    for (const bad of FORBIDDEN_ENV_SUBSTRINGS) {
      if (String(line).includes(bad)) {
        const err = new Error(
          `Forbidden image environment material detected (${bad.split('=')[0]})`,
        )
        err.code = 'INSPECT_MISMATCH'
        throw err
      }
    }
  }
  return {
    user,
    entrypoint,
    architecture: inspect.Architecture || '',
    os: inspect.Os || '',
    size: inspect.Size ?? null,
    id: inspect.Id || '',
    repoDigests: inspect.RepoDigests || [],
    labels: config.Labels || {},
    env,
  }
}

/**
 * Prevent claiming multi-arch FDS output unless both platforms were actually built.
 */
export function architectureClaim(builtArchitectures, options = {}) {
  const built = [...new Set((builtArchitectures || []).filter(Boolean))]
  const baseSupports = options.baseSupportsMultiArch === true
  const claimMultiArch = options.claimMultiArch === true
  if (claimMultiArch && !(built.includes('amd64') && built.includes('arm64'))) {
    const err = new Error(
      'Refusing multi-architecture claim: FDS outputs for both linux/amd64 and linux/arm64 were not built and inspected',
    )
    err.code = 'ARCH_CLAIM_INVALID'
    throw err
  }
  return {
    builtArchitectures: built,
    multiArchFdsImage: built.includes('amd64') && built.includes('arm64'),
    baseSupportsMultiArch: baseSupports,
    note: baseSupports
      ? 'Base index supports amd64+arm64; FDS application image multi-arch requires an explicit CI matrix build.'
      : 'Base multi-arch support not confirmed in this run.',
  }
}

export function createSupplyChainSession(deps = {}) {
  const ids = deps.ids ?? createDefaultRunIds()
  const log =
    deps.log ??
    ((msg) => {
      process.stdout.write(`[e5.5.1-image-supply-chain] ${sanitizeText(msg)}\n`)
    })
  const logErr =
    deps.logErr ??
    ((msg) => {
      process.stderr.write(`[e5.5.1-image-supply-chain] FAIL: ${sanitizeText(msg)}\n`)
    })
  const run = deps.run ?? createSpawnRunner()
  const exists = deps.existsSync ?? existsSync
  const readFile = deps.readFileSync ?? readFileSync
  const writeFile = deps.writeFileSync ?? writeFileSync
  const mkdir = deps.mkdirSync ?? mkdirSync
  const mkdtemp = deps.mkdtempSync ?? mkdtempSync
  const rm = deps.rmSync ?? rmSync
  const now = deps.now ?? (() => Date.now())
  const timeoutMs = deps.timeoutMs ?? Number(process.env.E551_TIMEOUT_MS || 1_200_000)
  const keepImage =
    deps.keepImage !== undefined
      ? deps.keepImage
      : String(process.env.E551_KEEP_IMAGE || '0') === '1' ||
        String(process.env.E551_KEEP_IMAGE || '').toLowerCase() === 'true'
  const outputRoot = deps.outputRoot ?? process.env.E551_OUTPUT_DIR ?? null
  const workController = deps.workController ?? new AbortController()
  const setTimeoutImpl = deps.setTimeoutImpl ?? setTimeout
  const clearTimeoutImpl = deps.clearTimeoutImpl ?? clearTimeout

  const abort = { signalled: false, reason: null, codeHint: undefined }
  let cleanupPromise = null
  let cleanupCalls = 0
  let outputDir = null
  let imageBuilt = false
  let timeoutHandle = null

  const state = {
    scoutVersion: null,
    dockerVersion: null,
    buildxVersion: null,
    hostArch: null,
    inspection: null,
    sbom: null,
    cveCounts: null,
    policy: null,
    javaVersion: null,
    basePlatformEvidence: null,
    architecture: null,
    removed: { outputDir: false, image: false },
  }

  function abortWork(reason, codeHint) {
    abort.signalled = true
    abort.reason = reason
    if (typeof codeHint === 'number') abort.codeHint = codeHint
    try {
      if (!workController.signal.aborted) workController.abort(reason || 'aborted')
    } catch {
      /* best-effort */
    }
  }

  function throwIfAborted() {
    if (abort.signalled) {
      const err = new Error(abort.reason || 'aborted')
      err.code = 'ABORTED'
      throw err
    }
  }

  async function docker(args, options = {}) {
    const result = await run('docker', args, {
      ...options,
      signal: options.signal ?? workController.signal,
    })
    if (options.allowFail) return result
    if (result.code !== 0) {
      throw new Error(
        `docker ${args.slice(0, 4).join(' ')}… failed (${result.code}): ${sanitizeText(
          result.stderr || result.stdout,
        )}`,
      )
    }
    return result
  }

  async function cleanup() {
    if (cleanupPromise) return cleanupPromise
    cleanupPromise = (async () => {
      cleanupCalls += 1
      if (outputDir) {
        try {
          rm(outputDir, { recursive: true, force: true })
          state.removed.outputDir = true
        } catch {
          /* tolerate already removed */
        }
      }
      if (imageBuilt && !keepImage) {
        await docker(['rmi', '-f', ids.imageTag], { allowFail: true })
        state.removed.image = true
      }
    })()
    return cleanupPromise
  }

  async function assertPrerequisites() {
    throwIfAborted()
    const info = await run('docker', ['info'], { signal: workController.signal })
    if (info.code !== 0) {
      const err = new Error(
        'Docker/Rancher Desktop unavailable. Set DOCKER_HOST=unix://$HOME/.rd/docker.sock. Refusing mock fallback.',
      )
      err.code = 'DOCKER_UNAVAILABLE'
      throw err
    }
    const ver = await docker(['version', '--format', '{{.Client.Version}}'])
    state.dockerVersion = ver.stdout.trim()

    const buildx = await run('docker', ['buildx', 'version'], {
      signal: workController.signal,
    })
    if (buildx.code !== 0) {
      const err = new Error('docker buildx is required but unavailable')
      err.code = 'BUILDX_UNAVAILABLE'
      throw err
    }
    state.buildxVersion = sanitizeText((buildx.stdout || buildx.stderr || '').split('\n')[0])

    const scout = await run('docker', ['scout', 'version'], {
      signal: workController.signal,
    })
    if (scout.code !== 0) {
      const err = new Error(
        'Docker Scout is required for FB-E5.5.1 SBOM/CVE verification but is unavailable. Install/enable Docker Scout and retry. Refusing to skip scans.',
      )
      err.code = 'SCOUT_UNAVAILABLE'
      throw err
    }
    state.scoutVersion = parseScoutVersionText(`${scout.stdout || ''}\n${scout.stderr || ''}`)

    const arch = await run('uname', ['-m'], { signal: workController.signal })
    state.hostArch = (arch.stdout || '').trim() || process.arch
    log(`Docker ${state.dockerVersion}; Scout present; host arch ${state.hostArch}`)
  }

  async function verifyPinnedBasePlatforms() {
    throwIfAborted()
    const evidence = {}
    for (const [stage, base] of Object.entries(PINNED_BASES)) {
      const result = await docker(['buildx', 'imagetools', 'inspect', base.reference], {
        allowFail: true,
      })
      if (result.code !== 0) {
        const err = new Error(
          `Unable to verify pinned base ${base.reference}: ${sanitizeText(result.stderr || result.stdout)}`,
        )
        err.code = 'BASE_DIGEST_UNVERIFIED'
        throw err
      }
      const text = `${result.stdout}\n${result.stderr}`
      const digestToken = base.digest.replace(/^sha256:/, '')
      if (!text.includes(digestToken) && !text.includes(base.digest)) {
        const err = new Error(`Pinned digest not observed in imagetools output for ${base.name}`)
        err.code = 'BASE_DIGEST_MISMATCH'
        throw err
      }
      const platforms = []
      if (/linux\/amd64/.test(text)) platforms.push('linux/amd64')
      if (/linux\/arm64/.test(text)) platforms.push('linux/arm64')
      for (const needed of base.expectedPlatforms) {
        if (!platforms.includes(needed)) {
          const err = new Error(
            `Pinned base ${base.reference} missing expected platform ${needed} in registry metadata`,
          )
          err.code = 'BASE_PLATFORM_MISSING'
          throw err
        }
      }
      evidence[stage] = {
        reference: base.reference,
        resolvedAt: base.resolvedAt,
        platforms,
      }
      log(
        `${stage} base ${base.name}:${base.tag} digest verified; platforms ${platforms.join(',')}`,
      )
    }
    state.basePlatformEvidence = evidence
    return evidence
  }

  function prepareOutputDir() {
    if (outputRoot) {
      outputDir = join(outputRoot, ids.outputDirName)
      mkdir(outputDir, { recursive: true })
    } else {
      outputDir = mkdtemp(join(tmpdir(), 'dg20-e551-'))
    }
    log('Temporary output directory prepared')
    return outputDir
  }

  async function buildImage() {
    throwIfAborted()
    if (!exists(DOCKERFILE)) {
      throw new Error(`Dockerfile missing at ${DOCKERFILE}`)
    }
    log(`Building local final image ${ids.imageTag} (never push)…`)
    await docker(['build', '-t', ids.imageTag, '-f', DOCKERFILE, SERVICE_DIR], {
      forward: true,
    })
    imageBuilt = true
    log('Image build complete')
  }

  async function inspectImage() {
    throwIfAborted()
    const result = await docker(['inspect', ids.imageTag])
    const parsed = JSON.parse(result.stdout)
    const inspect = parsed[0]
    state.inspection = assertImageInspection(inspect)
    state.architecture = architectureClaim([normalizeArch(state.inspection.architecture)], {
      baseSupportsMultiArch: true,
      claimMultiArch: false,
    })
    log(
      `Inspect OK user=${state.inspection.user} arch=${state.inspection.architecture} os=${state.inspection.os}`,
    )
    return state.inspection
  }

  function normalizeArch(arch) {
    const a = String(arch || '').toLowerCase()
    if (a === 'x86_64' || a === 'amd64') return 'amd64'
    if (a === 'aarch64' || a === 'arm64') return 'arm64'
    return a
  }

  async function probeJavaVersion() {
    throwIfAborted()
    const result = await docker(['run', '--rm', '--entrypoint', 'java', ids.imageTag, '-version'], {
      allowFail: true,
    })
    const text = `${result.stderr}\n${result.stdout}`
    state.javaVersion = sanitizeText(
      text.split('\n').find((l) => /version/i.test(l)) || text.trim(),
    )
    log(`Java probe: ${state.javaVersion}`)
  }

  async function generateSbom() {
    throwIfAborted()
    const sbomPath = join(outputDir, 'runtime.spdx.json')
    const result = await docker(
      ['scout', 'sbom', '--format', 'spdx', '--output', sbomPath, `local://${ids.imageTag}`],
      { allowFail: true },
    )
    if (result.code !== 0) {
      const err = new Error(
        `Docker Scout SBOM generation failed: ${sanitizeText(result.stderr || result.stdout)}`,
      )
      err.code = 'SBOM_FAILED'
      throw err
    }
    if (!exists(sbomPath)) {
      if (result.stdout.trim().startsWith('{')) {
        writeFile(sbomPath, result.stdout, 'utf8')
      } else {
        const err = new Error('SBOM output file missing after docker scout sbom')
        err.code = 'SBOM_FAILED'
        throw err
      }
    }
    const raw = readFile(sbomPath, 'utf8')
    state.sbom = parseSpdxDocument(raw)
    log(`SBOM OK format=${state.sbom.format} packages=${state.sbom.packageCount}`)
    return state.sbom
  }

  async function scanCves() {
    throwIfAborted()
    const cvePath = join(outputDir, 'runtime.cves.sarif.json')
    const result = await docker(
      ['scout', 'cves', '--format', 'sarif', '--output', cvePath, `local://${ids.imageTag}`],
      { allowFail: true },
    )
    if (result.code !== 0 && result.code !== 2) {
      const detail = sanitizeText(result.stderr || result.stdout)
      if (isScoutAuthRequiredMessage(detail)) {
        const err = new Error(
          'Docker Scout CVE analysis requires Docker Hub authentication (docker login / Docker Desktop). SBOM may succeed without login, but CVE scanning cannot be skipped or auto-installed. Log in locally and re-run npm run e5.5.1:verify. Do not paste credentials into the verifier.',
        )
        err.code = 'SCOUT_AUTH_REQUIRED'
        throw err
      }
      const err = new Error(`Docker Scout CVE scan failed: ${detail}`)
      err.code = 'CVE_SCAN_FAILED'
      throw err
    }
    if (!exists(cvePath)) {
      if (result.stdout.trim().startsWith('{')) {
        writeFile(cvePath, result.stdout, 'utf8')
      } else {
        const err = new Error('CVE SARIF output file missing after docker scout cves')
        err.code = 'CVE_SCAN_FAILED'
        throw err
      }
    }
    const raw = readFile(cvePath, 'utf8')
    state.cveCounts = countSeveritiesFromSarif(raw)
    state.policy = evaluateCvePolicy(state.cveCounts)
    log(
      `CVE counts critical=${state.cveCounts.critical} high=${state.cveCounts.high} medium=${state.cveCounts.medium} low=${state.cveCounts.low}`,
    )
    if (state.cveCounts.high > 0) {
      log(`HIGH findings require ownership (not waived): count=${state.cveCounts.high}`)
    }
    return state.cveCounts
  }

  function formSummary(acceptance, exitCode) {
    const parts = [
      `acceptance=${acceptance}`,
      `exit=${exitCode}`,
      `image=${ids.imageTag}`,
      `id=${(state.inspection?.id || '').slice(0, 19)}`,
      `arch=${state.inspection?.architecture || ''}`,
      `os=${state.inspection?.os || ''}`,
      `size=${state.inspection?.size ?? ''}`,
      `user=${state.inspection?.user || ''}`,
      `scout=${state.scoutVersion || ''}`,
      `sbom=${state.sbom?.format || ''}`,
      `pkgs=${state.sbom?.packageCount ?? ''}`,
      `cve_critical=${state.cveCounts?.critical ?? ''}`,
      `cve_high=${state.cveCounts?.high ?? ''}`,
      `cve_medium=${state.cveCounts?.medium ?? ''}`,
      `cve_low=${state.cveCounts?.low ?? ''}`,
      `keep_image=${keepImage ? 1 : 0}`,
      `no-push`,
      `no-deploy`,
    ]
    return `SUMMARY ${parts.join(' ')}`
  }

  async function runVerify() {
    const started = now()
    timeoutHandle = setTimeoutImpl(() => {
      abortWork(`Overall timeout after ${timeoutMs}ms`, 124)
    }, timeoutMs)
    void timeoutHandle

    let exitCode = 1
    let acceptance = 'INCOMPLETE'

    try {
      await assertPrerequisites()
      await verifyPinnedBasePlatforms()
      prepareOutputDir()
      await buildImage()
      await inspectImage()
      await probeJavaVersion()
      await generateSbom()
      await scanCves()
      throwIfAborted()

      acceptance = state.policy.acceptance
      exitCode = state.policy.exitCode
      if (exitCode !== 0) {
        logErr(state.policy.reason)
      } else {
        log(
          acceptance === 'PASS'
            ? 'PASS — FDS image supply-chain verification completed'
            : `PASS_WITH_HIGH_FINDINGS — ${state.policy.reason}`,
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = error && error.code
      if (code === 'SCOUT_UNAVAILABLE') {
        acceptance = 'BLOCKED_SCOUT_UNAVAILABLE'
        exitCode = 1
      } else if (code === 'SCOUT_AUTH_REQUIRED') {
        acceptance = 'BLOCKED_SCOUT_AUTH'
        exitCode = 1
      } else if (code === 'ABORTED') {
        acceptance = 'ABORTED'
        exitCode = typeof abort.codeHint === 'number' ? abort.codeHint : 124
      } else if (code === 'ARCH_CLAIM_INVALID') {
        acceptance = 'BLOCKED_ARCH_CLAIM'
        exitCode = 1
      } else {
        acceptance = 'FAILED'
        exitCode = 1
      }
      logErr(message)
    } finally {
      if (timeoutHandle) clearTimeoutImpl(timeoutHandle)
      try {
        log(formSummary(acceptance, exitCode))
      } catch {
        /* summary best-effort */
      }
      await cleanup()
    }

    return {
      exitCode,
      acceptance,
      cleanupCalls,
      ids,
      state,
      elapsedMs: now() - started,
      keepImage,
    }
  }

  return {
    ids,
    requestAbort: abortWork,
    cleanup,
    runVerify,
    getState: () => state,
  }
}

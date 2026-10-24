/**
 * FB-E5.5.1 — supply-chain verifier unit tests (no Docker required).
 */

import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  PINNED_BASES,
  architectureClaim,
  assertImageInspection,
  countSeveritiesFromSarif,
  createSupplyChainSession,
  evaluateCvePolicy,
  parseSpdxDocument,
  sanitizeText,
} from './e5.5.1-image-supply-chain-core.mjs'

function goodInspect(overrides = {}) {
  return {
    Id: 'sha256:abc123def456789012345678901234567890',
    Architecture: 'arm64',
    Os: 'linux',
    Size: 250_000_000,
    Config: {
      User: '10001:10001',
      Entrypoint: ['java', '-jar', '/app/app.jar'],
      ExposedPorts: { '8080/tcp': {} },
      Env: ['PATH=/usr/bin', 'JAVA_HOME=/opt/java/openjdk'],
      Labels: {
        'org.opencontainers.image.title': 'form-definition-service',
        'dg20.form-builder.increment': 'FB-E5.5.1',
      },
      ...(overrides.Config || {}),
    },
    ...overrides,
  }
}

function createFakeRunner(options = {}) {
  const files = new Map()
  const calls = []
  const removedImages = []
  let scoutOk = options.scoutOk !== false
  let sbomBody =
    options.sbomBody == null
      ? JSON.stringify({
          spdxVersion: 'SPDX-2.3',
          name: 'fds-runtime',
          packages: [{ name: 'app.jar', SPDXID: 'SPDXRef-1' }],
        })
      : typeof options.sbomBody === 'string'
        ? options.sbomBody
        : JSON.stringify(options.sbomBody)
  let cveBody =
    options.cveBody == null
      ? JSON.stringify({
          severities: { critical: 0, high: 0, medium: 1, low: 2 },
        })
      : typeof options.cveBody === 'string'
        ? options.cveBody
        : JSON.stringify(options.cveBody)

  const run = vi.fn(async (command, args) => {
    calls.push([command, ...args])
    if (command === 'uname') return { code: 0, stdout: 'arm64\n', stderr: '' }

    if (command !== 'docker') {
      return { code: 127, stdout: '', stderr: 'not docker' }
    }

    if (args[0] === 'info') return { code: 0, stdout: 'Server', stderr: '' }
    if (args[0] === 'version') return { code: 0, stdout: '29.5.3-rd\n', stderr: '' }
    if (args[0] === 'buildx' && args[1] === 'version') {
      return { code: 0, stdout: 'github.com/docker/buildx v0.33.0\n', stderr: '' }
    }
    if (args[0] === 'scout' && args[1] === 'version') {
      return scoutOk
        ? { code: 0, stdout: 'version: v1.20.4\n', stderr: '' }
        : { code: 127, stdout: '', stderr: 'scout missing' }
    }
    if (args[0] === 'buildx' && args[1] === 'imagetools') {
      const ref = args[3] || ''
      const base = Object.values(PINNED_BASES).find((b) => ref.includes(b.digest.slice(7)))
      const digest = base ? base.digest : 'sha256:dead'
      return {
        code: 0,
        stdout: `Name: test\nDigest: ${digest}\nPlatform: linux/amd64\nPlatform: linux/arm64/v8\n`,
        stderr: '',
      }
    }
    if (args[0] === 'build') return { code: 0, stdout: 'built', stderr: '' }
    if (args[0] === 'inspect') {
      return {
        code: 0,
        stdout: JSON.stringify([options.inspect || goodInspect()]),
        stderr: '',
      }
    }
    if (args[0] === 'run' && args.includes('java')) {
      return { code: 0, stdout: '', stderr: 'openjdk version "17.0.19" 2026-04-21\n' }
    }
    if (args[0] === 'scout' && args[1] === 'sbom') {
      const outIdx = args.indexOf('--output')
      const outPath = outIdx >= 0 ? args[outIdx + 1] : null
      if (outPath) {
        files.set(outPath, sbomBody)
        writeFileSync(outPath, sbomBody)
      }
      return options.sbomFail
        ? { code: 1, stdout: '', stderr: 'sbom failed' }
        : { code: 0, stdout: '', stderr: '' }
    }
    if (args[0] === 'scout' && args[1] === 'cves') {
      const outIdx = args.indexOf('--output')
      const outPath = outIdx >= 0 ? args[outIdx + 1] : null
      if (outPath) {
        files.set(outPath, cveBody)
        writeFileSync(outPath, cveBody)
      }
      return options.cveFail
        ? { code: 1, stdout: '', stderr: 'cve failed' }
        : { code: 0, stdout: '', stderr: '' }
    }
    if (args[0] === 'rmi') {
      removedImages.push(args[2])
      return { code: 0, stdout: '', stderr: '' }
    }
    return { code: 0, stdout: '', stderr: '' }
  })

  return {
    run,
    calls,
    removedImages,
    setScoutOk: (v) => {
      scoutOk = v
    },
    setCveBody: (body) => {
      cveBody = typeof body === 'string' ? body : JSON.stringify(body)
    },
    setSbomBody: (body) => {
      sbomBody = typeof body === 'string' ? body : JSON.stringify(body)
    },
    files,
  }
}

describe('FB-E5.5.1 supply-chain helpers', () => {
  it('parses SPDX and rejects malformed/invalid documents', () => {
    const ok = parseSpdxDocument({
      spdxVersion: 'SPDX-2.3',
      packages: [{ name: 'a' }],
    })
    expect(ok.packageCount).toBe(1)
    expect(() => parseSpdxDocument('{')).toThrow(/Malformed/)
    expect(() => parseSpdxDocument({ packages: [] })).toThrow(/spdxVersion/)
    expect(() => parseSpdxDocument({ spdxVersion: 'SPDX-2.3', packages: [] })).toThrow(/packages/)
  })

  it('counts severities and blocks critical findings without waiver', () => {
    const counts = countSeveritiesFromSarif({
      severities: { critical: 2, high: 3, medium: 1, low: 0 },
    })
    expect(counts.critical).toBe(2)
    const blocked = evaluateCvePolicy(counts)
    expect(blocked.acceptance).toBe('BLOCKED')
    expect(blocked.exitCode).toBe(1)

    const highOnly = evaluateCvePolicy({ critical: 0, high: 4, medium: 0, low: 0 })
    expect(highOnly.acceptance).toBe('PASS_WITH_HIGH_FINDINGS')
    expect(highOnly.exitCode).toBe(0)
    expect(highOnly.reason).toMatch(/high finding/)
  })

  it('rejects inspection mismatches and forbidden env', () => {
    expect(() =>
      assertImageInspection(
        goodInspect({ Config: { User: '0:0', Entrypoint: ['java', '-jar', '/app/app.jar'] } }),
      ),
    ).toThrow(/user mismatch/)
    expect(() =>
      assertImageInspection(
        goodInspect({
          Config: {
            User: '10001:10001',
            Entrypoint: ['java', '-jar', '/app/app.jar'],
            ExposedPorts: { '8080/tcp': {} },
            Env: ['SPRING_PROFILES_ACTIVE=governance-technical'],
          },
        }),
      ),
    ).toThrow(/Forbidden/)
  })

  it('prevents multi-arch claims without both built architectures', () => {
    expect(() =>
      architectureClaim(['arm64'], { claimMultiArch: true, baseSupportsMultiArch: true }),
    ).toThrow(/Refusing multi-architecture claim/)
    const ok = architectureClaim(['arm64'], {
      claimMultiArch: false,
      baseSupportsMultiArch: true,
    })
    expect(ok.multiArchFdsImage).toBe(false)
  })

  it('redacts home paths, docker sockets, and bearer tokens', () => {
    const sample = `DOCKER_HOST=unix://${process.env.HOME}/.rd/docker.sock Bearer eyJhbGciOiJIUzI1NiJ9.abc password="s3cret"`
    const cleaned = sanitizeText(sample)
    expect(cleaned).not.toContain(process.env.HOME || 'impossible')
    expect(cleaned).toMatch(/DOCKER_HOST=\[redacted\]|unix:\/\/\[docker-socket\]/)
    expect(cleaned).toContain('Bearer [redacted]')
    expect(cleaned).toContain('[redacted]')
  })
})

describe('FB-E5.5.1 supply-chain session lifecycle', () => {
  it('sequences commands and forms a successful summary with cleanup', async () => {
    const ids = {
      runId: 'deadbeef',
      imageTag: 'dg20/form-definition-service:e5.5.1-local-deadbeef',
      outputDirName: 'dg20-e551-deadbeef',
    }
    const fake = createFakeRunner({ ids })
    const logs = []
    const root = mkdtempSync(join(tmpdir(), 'e551-test-'))

    const session = createSupplyChainSession({
      ids,
      run: fake.run,
      outputRoot: root,
      keepImage: false,
      existsSync: (p) => existsSync(p) || String(p).endsWith('Dockerfile'),
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
      timeoutMs: 30_000,
    })

    const result = await session.runVerify()
    expect(result.exitCode).toBe(0)
    expect(result.acceptance).toMatch(/^PASS/)
    expect(result.cleanupCalls).toBe(1)
    expect(fake.removedImages).toContain(ids.imageTag)
    expect(logs.some((l) => l.startsWith('SUMMARY '))).toBe(true)
    expect(logs.some((l) => l.includes('no-push'))).toBe(true)
    expect(fake.calls.some((c) => c[0] === 'docker' && c[1] === 'build')).toBe(true)
    expect(fake.calls.some((c) => c[0] === 'docker' && c[1] === 'scout' && c[2] === 'sbom')).toBe(
      true,
    )
    expect(fake.calls.some((c) => c[0] === 'docker' && c[1] === 'scout' && c[2] === 'cves')).toBe(
      true,
    )
    // Does not prune unrelated resources
    expect(fake.calls.some((c) => c.includes('prune'))).toBe(false)
    expect(fake.calls.some((c) => c[1] === 'system')).toBe(false)

    rmSync(root, { recursive: true, force: true })
  })

  it('fails clearly when Scout CVE requires Docker Hub login', async () => {
    const ids = {
      runId: 'scoutauth',
      imageTag: 'dg20/form-definition-service:e5.5.1-local-scoutauth',
      outputDirName: 'dg20-e551-scoutauth',
    }
    const fake = createFakeRunner({ ids, cveFail: true })
    // Override cves stderr to look like scout auth failure
    const original = fake.run.getMockImplementation()
    fake.run.mockImplementation(async (command, args) => {
      if (command === 'docker' && args[0] === 'scout' && args[1] === 'cves') {
        return {
          code: 1,
          stdout: '',
          stderr: 'Log in with your Docker ID or email address to use docker scout.\n',
        }
      }
      return original(command, args)
    })
    const root = mkdtempSync(join(tmpdir(), 'e551-auth-'))
    const logs = []
    const session = createSupplyChainSession({
      ids,
      run: fake.run,
      outputRoot: root,
      keepImage: true,
      existsSync: (p) => existsSync(p) || String(p).includes('Dockerfile'),
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
      timeoutMs: 10_000,
    })
    const result = await session.runVerify()
    expect(result.exitCode).toBe(1)
    expect(result.acceptance).toBe('BLOCKED_SCOUT_AUTH')
    expect(logs.some((l) => /Docker Hub authentication/i.test(l))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('fails clearly when Docker Scout is unavailable (no silent skip)', async () => {
    const ids = {
      runId: 'scoutfail',
      imageTag: 'dg20/form-definition-service:e5.5.1-local-scoutfail',
      outputDirName: 'dg20-e551-scoutfail',
    }
    const fake = createFakeRunner({ ids, scoutOk: false })
    const logs = []
    const session = createSupplyChainSession({
      ids,
      run: fake.run,
      keepImage: true,
      existsSync: () => true,
      mkdtempSync: () => join(tmpdir(), 'unused'),
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
      timeoutMs: 10_000,
    })
    const result = await session.runVerify()
    expect(result.exitCode).toBe(1)
    expect(result.acceptance).toBe('BLOCKED_SCOUT_UNAVAILABLE')
    expect(logs.some((l) => /Scout is required/i.test(l))).toBe(true)
  })

  it('fails on malformed SBOM', async () => {
    const ids = {
      runId: 'sbomfail',
      imageTag: 'dg20/form-definition-service:e5.5.1-local-sbomfail',
      outputDirName: 'dg20-e551-sbomfail',
    }
    const fake = createFakeRunner({ ids, sbomBody: '{not-json' })
    const root = mkdtempSync(join(tmpdir(), 'e551-sbom-'))
    const session = createSupplyChainSession({
      ids,
      run: fake.run,
      outputRoot: root,
      keepImage: true,
      existsSync: (p) => existsSync(p) || String(p).includes('Dockerfile'),
      log: () => {},
      logErr: () => {},
      timeoutMs: 10_000,
    })
    const result = await session.runVerify()
    expect(result.exitCode).toBe(1)
    expect(result.acceptance).toBe('FAILED')
    rmSync(root, { recursive: true, force: true })
  })

  it('blocks on critical CVE findings', async () => {
    const ids = {
      runId: 'critcve',
      imageTag: 'dg20/form-definition-service:e5.5.1-local-critcve',
      outputDirName: 'dg20-e551-critcve',
    }
    const fake = createFakeRunner({
      ids,
      cveBody: { severities: { critical: 1, high: 0, medium: 0, low: 0 } },
    })
    const root = mkdtempSync(join(tmpdir(), 'e551-crit-'))
    const logs = []
    const session = createSupplyChainSession({
      ids,
      run: fake.run,
      outputRoot: root,
      keepImage: true,
      existsSync: (p) => existsSync(p) || String(p).includes('Dockerfile'),
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
      timeoutMs: 10_000,
    })
    const result = await session.runVerify()
    expect(result.exitCode).toBe(1)
    expect(result.acceptance).toBe('BLOCKED')
    expect(logs.some((l) => /critical/i.test(l))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('reports high-only findings without claiming a silent clean pass', async () => {
    const ids = {
      runId: 'highonly',
      imageTag: 'dg20/form-definition-service:e5.5.1-local-highonly',
      outputDirName: 'dg20-e551-highonly',
    }
    const fake = createFakeRunner({
      ids,
      cveBody: { severities: { critical: 0, high: 2, medium: 0, low: 0 } },
    })
    const root = mkdtempSync(join(tmpdir(), 'e551-high-'))
    const logs = []
    const session = createSupplyChainSession({
      ids,
      run: fake.run,
      outputRoot: root,
      keepImage: true,
      existsSync: (p) => existsSync(p) || String(p).includes('Dockerfile'),
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
      timeoutMs: 10_000,
    })
    const result = await session.runVerify()
    expect(result.exitCode).toBe(0)
    expect(result.acceptance).toBe('PASS_WITH_HIGH_FINDINGS')
    expect(logs.some((l) => /HIGH findings require ownership/i.test(l))).toBe(true)
    expect(logs.some((l) => /cve_high=2/.test(l))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('fails on inspection mismatch', async () => {
    const ids = {
      runId: 'baduser',
      imageTag: 'dg20/form-definition-service:e5.5.1-local-baduser',
      outputDirName: 'dg20-e551-baduser',
    }
    const fake = createFakeRunner({
      ids,
      inspect: goodInspect({
        Config: { User: '0:0', Entrypoint: ['java', '-jar', '/app/app.jar'] },
      }),
    })
    const root = mkdtempSync(join(tmpdir(), 'e551-user-'))
    const session = createSupplyChainSession({
      ids,
      run: fake.run,
      outputRoot: root,
      keepImage: true,
      existsSync: (p) => existsSync(p) || String(p).includes('Dockerfile'),
      log: () => {},
      logErr: () => {},
      timeoutMs: 10_000,
    })
    const result = await session.runVerify()
    expect(result.exitCode).toBe(1)
    expect(result.acceptance).toBe('FAILED')
    rmSync(root, { recursive: true, force: true })
  })

  it('honours abort/timeout path and still cleans once', async () => {
    const ids = {
      runId: 'timeout',
      imageTag: 'dg20/form-definition-service:e5.5.1-local-timeout',
      outputDirName: 'dg20-e551-timeout',
    }
    const fake = createFakeRunner({ ids })
    const root = mkdtempSync(join(tmpdir(), 'e551-to-'))
    let timeoutCb
    const session = createSupplyChainSession({
      ids,
      run: fake.run,
      outputRoot: root,
      keepImage: false,
      existsSync: (p) => existsSync(p) || String(p).includes('Dockerfile'),
      setTimeoutImpl: (cb) => {
        timeoutCb = cb
        return 1
      },
      clearTimeoutImpl: () => {},
      log: () => {},
      logErr: () => {},
      timeoutMs: 1,
    })
    // Abort before run completes by firing timeout immediately after start
    const pending = session.runVerify()
    timeoutCb()
    const result = await pending
    expect([124, 1]).toContain(result.exitCode)
    expect(result.cleanupCalls).toBe(1)
    rmSync(root, { recursive: true, force: true })
  })

  it('retains image when keepImage is true and still deletes temp output', async () => {
    const ids = {
      runId: 'keepimg',
      imageTag: 'dg20/form-definition-service:e5.5.1-local-keepimg',
      outputDirName: 'dg20-e551-keepimg',
    }
    const fake = createFakeRunner({ ids })
    const root = mkdtempSync(join(tmpdir(), 'e551-keep-'))
    const outPath = join(root, ids.outputDirName)
    const session = createSupplyChainSession({
      ids,
      run: fake.run,
      outputRoot: root,
      keepImage: true,
      existsSync: (p) => existsSync(p) || String(p).includes('Dockerfile'),
      log: () => {},
      logErr: () => {},
      timeoutMs: 10_000,
    })
    const result = await session.runVerify()
    expect(result.exitCode).toBe(0)
    expect(fake.removedImages).not.toContain(ids.imageTag)
    expect(existsSync(outPath)).toBe(false)
    // Ensure SBOM was written during the run (read through fake files map)
    expect([...fake.files.keys()].some((p) => String(p).endsWith('runtime.spdx.json'))).toBe(true)
    // And that generated evidence is not left behind for commit
    expect(existsSync(join(outPath, 'runtime.spdx.json'))).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('FB-E5.5.1 Dockerfile pin constants', () => {
  it('matches documented official digests resolved 2026-07-29', () => {
    expect(PINNED_BASES.build.digest).toBe(
      'sha256:f58d59b6273e785ac0a4477f6e9b5ba1d7731c75b906c0f7b34076f1851318cc',
    )
    expect(PINNED_BASES.runtime.digest).toBe(
      'sha256:475d8e96b4b2bfe08999e5e854755c773af1581acdf959a4545d88f0696a2339',
    )
    const dockerfile = readFileSync(
      join(process.cwd(), 'services/form-definition-service/Dockerfile'),
      'utf8',
    )
    expect(dockerfile).toContain(PINNED_BASES.build.digest)
    expect(dockerfile).toContain(PINNED_BASES.runtime.digest)
    expect(dockerfile).not.toMatch(/org\.opencontainers\.image\.created/)
    expect(dockerfile).not.toMatch(/VCS_REF/)
  })
})

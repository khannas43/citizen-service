/**
 * FB-E5.1.1 — deterministic smoke lifecycle / cleanup regression tests (no Docker).
 */

import { describe, expect, it, vi } from 'vitest'

import {
  IMAGE,
  createSmokeSession,
  HEALTH_PATH,
  VALIDATION_PATH,
  GOV_QUEUE_PATH,
} from './e5.1-fds-container-smoke-core.mjs'

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body
    },
  }
}

function createFakeDocker() {
  const removed = { fds: false, pg: false, network: false }
  const calls = []
  let healthInspectRunning = true
  let flywayReady = false

  const run = vi.fn(async (command, args) => {
    calls.push([command, ...args])
    if (command !== 'docker') {
      return { code: 127, stdout: '', stderr: 'not docker' }
    }

    if (args[0] === 'info') return { code: 0, stdout: 'Server', stderr: '' }
    if (args[0] === 'build') return { code: 0, stdout: 'built', stderr: '' }
    if (args[0] === 'history') return { code: 0, stdout: 'history-no-secrets', stderr: '' }

    if (args[0] === 'inspect' && args[1] === IMAGE) {
      return {
        code: 0,
        stdout: JSON.stringify([
          {
            Architecture: 'arm64',
            Size: 137_000_000,
            Config: {
              User: '10001:10001',
              ExposedPorts: { '8080/tcp': {} },
              Entrypoint: ['java', '-jar', '/app/app.jar'],
              Env: ['PATH=/usr/bin', 'JAVA_HOME=/opt/java'],
              Labels: { 'dg20.form-builder.increment': 'FB-E5.1' },
            },
          },
        ]),
        stderr: '',
      }
    }

    if (args[0] === 'inspect' && String(args[1]).startsWith('dg20-e51-fds-')) {
      return {
        code: 0,
        stdout: JSON.stringify([
          {
            Config: { User: '10001:10001', Env: [] },
            HostConfig: { ReadonlyRootfs: true },
            Mounts: [],
            State: { Running: healthInspectRunning },
          },
        ]),
        stderr: '',
      }
    }

    if (args[0] === 'run' && args.includes('--entrypoint') && args.includes('java')) {
      return { code: 0, stdout: '', stderr: 'openjdk version "17.0.19" 2026-04-21\n' }
    }

    if (args[0] === 'run' && args.includes('postgres:16-alpine')) {
      flywayReady = true
      return { code: 0, stdout: 'pg-id', stderr: '' }
    }

    if (args[0] === 'run' && args.includes(IMAGE) && !args.includes('--entrypoint')) {
      return { code: 0, stdout: 'fds-id', stderr: '' }
    }

    if (args[0] === 'network' && args[1] === 'create') {
      removed.network = false
      return { code: 0, stdout: 'net', stderr: '' }
    }

    if (args[0] === 'network' && args[1] === 'rm') {
      removed.network = true
      return { code: 0, stdout: '', stderr: '' }
    }

    if (args[0] === 'rm' && args[1] === '-f') {
      if (String(args[2]).includes('-fds-')) removed.fds = true
      if (String(args[2]).includes('-pg-')) removed.pg = true
      return { code: 0, stdout: '', stderr: '' }
    }

    if (args[0] === 'exec' && args.includes('pg_isready')) {
      return { code: flywayReady ? 0 : 1, stdout: '', stderr: '' }
    }

    if (args[0] === 'exec' && args.includes('psql')) {
      return { code: 0, stdout: '1\n2\n3\n4\n', stderr: '' }
    }

    if (args[0] === 'exec' && args.includes('id')) {
      return { code: 0, stdout: '10001\n', stderr: '' }
    }

    if (args[0] === 'stop') {
      healthInspectRunning = false
      return { code: 0, stdout: '', stderr: '' }
    }

    if (args[0] === 'scout') {
      return { code: 1, stdout: '', stderr: 'unavailable' }
    }

    return { code: 0, stdout: '', stderr: '' }
  })

  return {
    run,
    removed,
    calls,
    setRunning: (v) => {
      healthInspectRunning = v
    },
  }
}

function createFetchSequence(sequence) {
  let i = 0
  return vi.fn(async (url) => {
    const step = sequence[Math.min(i, sequence.length - 1)]
    i += 1
    if (typeof step === 'function') return step(url)
    if (step instanceof Error) throw step
    return step
  })
}

describe('FB-E5.1.1 smoke lifecycle integrity', () => {
  it('stays alive across first health connection failure then succeeds; writes SUMMARY+PASS; cleanup once', async () => {
    const docker = createFakeDocker()
    const logs = []
    const fetchImpl = createFetchSequence([
      new Error('ECONNREFUSED'),
      (url) => {
        if (String(url).includes(HEALTH_PATH)) return jsonResponse({ status: 'UP' })
        if (String(url).includes(VALIDATION_PATH)) return jsonResponse({ valid: true, issues: [] })
        if (String(url).includes(GOV_QUEUE_PATH)) {
          return jsonResponse({ code: 'governance_unauthenticated' }, 401)
        }
        return jsonResponse({})
      },
    ])

    const session = createSmokeSession({
      run: docker.run,
      fetchImpl,
      freePort: async () => 18000,
      sleep: async () => {},
      healthIntervalMs: 1,
      healthTimeoutMs: 5_000,
      postgresTimeoutMs: 5_000,
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ serviceId: 'unit-e-technical-acceptance' }),
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
      timeoutMs: 60_000,
    })

    const result = await session.runSmoke()
    expect(result.exitCode).toBe(0)
    expect(result.cleanupCalls).toBe(1)
    expect(result.completedChecks).toEqual({
      health: true,
      flyway: true,
      validation: true,
      governance: true,
      security: true,
      shutdown: true,
    })
    expect(logs.some((l) => l.startsWith('SUMMARY '))).toBe(true)
    expect(logs.some((l) => l.includes('PASS — FDS container smoke completed'))).toBe(true)
    expect(docker.removed.fds).toBe(true)
    expect(docker.removed.pg).toBe(true)
    expect(docker.removed.network).toBe(true)
    const summaryIdx = logs.findIndex((l) => l.startsWith('SUMMARY '))
    const passIdx = logs.findIndex((l) => l.includes('PASS —'))
    expect(summaryIdx).toBeGreaterThan(-1)
    expect(passIdx).toBeGreaterThan(summaryIdx)
  })

  it('health timeout yields nonzero exit, no PASS/SUMMARY, and cleanup', async () => {
    const docker = createFakeDocker()
    const logs = []
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })

    const session = createSmokeSession({
      run: docker.run,
      fetchImpl,
      freePort: async () => 18081,
      sleep: async () => {},
      now: (() => {
        let t = 0
        return () => {
          t += 3_000
          return t
        }
      })(),
      healthIntervalMs: 1,
      healthTimeoutMs: 5_000,
      postgresTimeoutMs: 5_000,
      existsSync: () => true,
      readFileSync: () => '{}',
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
      timeoutMs: 60_000,
    })

    const result = await session.runSmoke()
    expect(result.exitCode).toBe(1)
    expect(result.cleanupCalls).toBe(1)
    expect(logs.some((l) => l.includes('PASS'))).toBe(false)
    expect(logs.some((l) => l.startsWith('SUMMARY '))).toBe(false)
    expect(logs.some((l) => l.startsWith('ERR:') && l.includes('timeout waiting for FDS'))).toBe(
      true,
    )
    expect(docker.removed.network).toBe(true)
  })

  it('verification exception triggers cleanup exactly once without PASS', async () => {
    const docker = createFakeDocker()
    const logs = []
    const fetchImpl = createFetchSequence([
      jsonResponse({ status: 'UP' }),
      jsonResponse({ valid: false, issues: [{ code: 'x' }] }),
    ])

    const session = createSmokeSession({
      run: docker.run,
      fetchImpl,
      freePort: async () => 18082,
      sleep: async () => {},
      healthIntervalMs: 1,
      healthTimeoutMs: 5_000,
      postgresTimeoutMs: 5_000,
      existsSync: () => true,
      readFileSync: () => '{}',
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
    })

    const result = await session.runSmoke()
    expect(result.exitCode).toBe(1)
    expect(result.cleanupCalls).toBe(1)
    expect(await session.cleanup()).toBeUndefined()
    expect(session.getCleanupCalls()).toBe(1)
    expect(logs.some((l) => l.includes('PASS'))).toBe(false)
    expect(logs.some((l) => l.startsWith('SUMMARY '))).toBe(false)
  })

  it('SIGINT/SIGTERM abort path cleans once and does not claim PASS', async () => {
    const docker = createFakeDocker()
    const logs = []
    let healthWaits = 0
    const fetchImpl = vi.fn(async () => {
      healthWaits += 1
      if (healthWaits === 1) {
        // First poll: schedule abort mid-wait
        return jsonResponse({ status: 'DOWN' })
      }
      throw new Error('should abort')
    })

    const session = createSmokeSession({
      run: docker.run,
      fetchImpl,
      freePort: async () => 18083,
      sleep: async () => {
        session.requestAbort('SIGINT received', 130)
      },
      healthIntervalMs: 1,
      healthTimeoutMs: 30_000,
      postgresTimeoutMs: 5_000,
      existsSync: () => true,
      readFileSync: () => '{}',
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
    })

    const result = await session.runSmoke()
    expect(result.exitCode).toBe(130)
    expect(result.cleanupCalls).toBe(1)
    expect(logs.some((l) => l.includes('PASS'))).toBe(false)
    expect(docker.removed.fds).toBe(true)
  })

  it('successful sequence cannot return before all checks', async () => {
    const docker = createFakeDocker()
    const fetchImpl = createFetchSequence([
      jsonResponse({ status: 'UP' }),
      (url) => {
        if (String(url).includes(VALIDATION_PATH)) return jsonResponse({ valid: true, issues: [] })
        if (String(url).includes(GOV_QUEUE_PATH)) {
          return jsonResponse({ code: 'governance_unauthenticated' }, 401)
        }
        return jsonResponse({ status: 'UP' })
      },
    ])

    const session = createSmokeSession({
      run: docker.run,
      fetchImpl,
      freePort: async () => 18084,
      sleep: async () => {},
      healthIntervalMs: 1,
      existsSync: () => true,
      readFileSync: () => '{}',
      log: () => {},
      logErr: () => {},
    })

    const result = await session.runSmoke()
    expect(result.exitCode).toBe(0)
    expect(Object.values(result.completedChecks).every(Boolean)).toBe(true)
  })

  it('ordinary success path does not invoke process.exit', async () => {
    const docker = createFakeDocker()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit must not be called on ordinary success')
    })
    const fetchImpl = createFetchSequence([
      jsonResponse({ status: 'UP' }),
      (url) => {
        if (String(url).includes(VALIDATION_PATH)) return jsonResponse({ valid: true, issues: [] })
        if (String(url).includes(GOV_QUEUE_PATH)) {
          return jsonResponse({ code: 'governance_unauthenticated' }, 401)
        }
        return jsonResponse({ status: 'UP' })
      },
    ])

    try {
      const session = createSmokeSession({
        run: docker.run,
        fetchImpl,
        freePort: async () => 18085,
        sleep: async () => {},
        healthIntervalMs: 1,
        existsSync: () => true,
        readFileSync: () => '{}',
        log: () => {},
        logErr: () => {},
      })
      const result = await session.runSmoke()
      expect(result.exitCode).toBe(0)
      expect(exitSpy).not.toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('hung health fetch is aborted and health timeout still cleans up', async () => {
    const docker = createFakeDocker()
    const logs = []
    const fetchImpl = vi.fn(
      (_url, options = {}) =>
        new Promise((_resolve, reject) => {
          const signal = options.signal
          if (!signal) return
          if (signal.aborted) {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            return
          }
          signal.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            { once: true },
          )
        }),
    )

    const session = createSmokeSession({
      run: docker.run,
      fetchImpl,
      freePort: async () => 18086,
      sleep: async () => {},
      now: (() => {
        let t = 0
        return () => {
          t += 2_000
          return t
        }
      })(),
      healthIntervalMs: 1,
      healthTimeoutMs: 5_000,
      postgresTimeoutMs: 5_000,
      fetchAttemptTimeoutMs: 10,
      existsSync: () => true,
      readFileSync: () => '{}',
      log: (m) => logs.push(m),
      logErr: (m) => logs.push(`ERR:${m}`),
      timeoutMs: 60_000,
    })

    const result = await session.runSmoke()
    expect(result.exitCode).toBe(1)
    expect(result.cleanupCalls).toBe(1)
    expect(logs.some((l) => l.includes('PASS'))).toBe(false)
    expect(docker.removed.network).toBe(true)
  })
})

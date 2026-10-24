#!/usr/bin/env node
/**
 * FB-E5.1 / E5.1.1 — Form Definition Service container smoke verifier CLI.
 *
 * Awaited top-level lifecycle; idempotent cleanup in `finally`; no process.exit
 * on ordinary success/failure (uses process.exitCode). Timeout stays referenced.
 *
 * Rancher Desktop:
 *   export DOCKER_HOST=unix://$HOME/.rd/docker.sock
 *   export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
 *   npm run e5.1:verify
 */

import { createSmokeSession } from './e5.1-fds-container-smoke-core.mjs'

const session = createSmokeSession()
let signalHandled = false

async function onSignal(signal, code) {
  if (signalHandled) return
  signalHandled = true
  session.requestAbort(`${signal} received`, code)
  try {
    await session.cleanup()
  } catch {
    /* cleanup is best-effort and idempotent */
  }
  process.exitCode = code
  // Allow natural flush; force exit for signals after cleanup so the process ends.
  process.exit(code)
}

process.on('SIGINT', () => {
  void onSignal('SIGINT', 130)
})
process.on('SIGTERM', () => {
  void onSignal('SIGTERM', 143)
})

const result = await session.runSmoke()
process.exitCode = result.exitCode

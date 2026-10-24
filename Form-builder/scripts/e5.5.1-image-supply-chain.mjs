#!/usr/bin/env node
/**
 * FB-E5.5.1 — FDS image supply-chain verifier CLI.
 *
 * Awaited top-level lifecycle; idempotent cleanup in `finally`; no process.exit
 * on ordinary success/failure (uses process.exitCode). Timeout stays referenced.
 *
 * Never pushes. Never deploys. Requires Docker + buildx + Docker Scout.
 *
 *   export DOCKER_HOST=unix://$HOME/.rd/docker.sock
 *   npm run e5.5.1:verify
 *
 * Optional:
 *   E551_KEEP_IMAGE=1     retain the run-scoped local image tag (default: remove)
 *   E551_OUTPUT_DIR=/tmp  parent for temporary SBOM/CVE files (deleted in finally)
 *   E551_TIMEOUT_MS=1200000
 */

import { createSupplyChainSession } from './e5.5.1-image-supply-chain-core.mjs'

const session = createSupplyChainSession()
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
  process.exit(code)
}

process.on('SIGINT', () => {
  void onSignal('SIGINT', 130)
})
process.on('SIGTERM', () => {
  void onSignal('SIGTERM', 143)
})

const result = await session.runVerify()
process.exitCode = result.exitCode

#!/usr/bin/env node
/**
 * FB-E5.2 — Form Definition Service Helm render-only verifier.
 *
 * Requires a local `helm` executable. Copies the chart + common dependency into
 * a temporary directory, then runs dependency build / lint / template only.
 * Never runs helm install/upgrade/uninstall or kubectl.
 */

import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertDefaultRender, assertIngressZuulRender } from './e5.2-helm-render-assert.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FORM_BUILDER = join(here, '..')

function log(msg) {
  process.stdout.write(`[e5.2-helm-render-verify] ${msg}\n`)
}

function fail(msg) {
  process.stderr.write(`[e5.2-helm-render-verify] FAIL: ${msg}\n`)
}

function resolveDigitDevOpsRoot() {
  if (process.env.DIGIT_DEVOPS_ROOT) {
    return resolve(process.env.DIGIT_DEVOPS_ROOT)
  }
  return resolve(FORM_BUILDER, '..', 'DIGIT-DevOps')
}

function requireHelm() {
  const probe = spawnSync('helm', ['version', '--short'], { encoding: 'utf8' })
  if (probe.error || probe.status !== 0) {
    throw new Error(
      'helm executable not found or failed. Install Helm locally; this verifier does not install it.',
    )
  }
  return (probe.stdout || probe.stderr || '').trim()
}

function runHelm(args, cwd) {
  const result = spawnSync('helm', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
  })
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

function copyChartTree(sourceChartDir, sourceCommonDir, tempRoot) {
  const chartsRoot = join(tempRoot, 'charts')
  const coreServices = join(chartsRoot, 'core-services')
  const commonParent = chartsRoot
  mkdirSync(coreServices, { recursive: true })
  const destChart = join(coreServices, 'form-definition-service')
  const destCommon = join(commonParent, 'common')
  cpSync(sourceChartDir, destChart, { recursive: true })
  cpSync(sourceCommonDir, destCommon, { recursive: true })
  // Ensure Chart.yaml dependency path still resolves to ../../common from core-services chart.
  return { destChart, destCommon }
}

function main() {
  let tempRoot = null
  let exitCode = 1
  try {
    const helmVersion = requireHelm()
    log(`helm available: ${helmVersion}`)

    const devops = resolveDigitDevOpsRoot()
    const sourceChart = join(
      devops,
      'deploy-as-code/helm/charts/core-services/form-definition-service',
    )
    const sourceCommon = join(devops, 'deploy-as-code/helm/charts/common')
    if (!existsSync(sourceChart)) {
      throw new Error(`chart not found: ${sourceChart} (set DIGIT_DEVOPS_ROOT)`)
    }
    if (!existsSync(sourceCommon)) {
      throw new Error(`common chart not found: ${sourceCommon}`)
    }
    log(`DIGIT-DevOps root: ${devops}`)

    tempRoot = mkdtempSync(join(tmpdir(), 'dg20-e52-helm-'))
    log(`temp workspace: ${tempRoot}`)
    const { destChart } = copyChartTree(sourceChart, sourceCommon, tempRoot)

    // Never mutate the source chart; work only in temp.
    const dep = runHelm(['dependency', 'build'], destChart)
    if (dep.code !== 0) {
      throw new Error(`helm dependency build failed: ${dep.stderr || dep.stdout}`)
    }
    log('helm dependency build OK')

    const lint = runHelm(['lint', '.'], destChart)
    if (lint.code !== 0) {
      throw new Error(`helm lint failed: ${lint.stderr || lint.stdout}`)
    }
    log('helm lint OK')
    process.stdout.write(lint.stdout)

    const defaultRender = runHelm(['template', 'fds-e52', '.', '--namespace', 'egov'], destChart)
    if (defaultRender.code !== 0) {
      throw new Error(
        `helm template (default) failed: ${defaultRender.stderr || defaultRender.stdout}`,
      )
    }
    const defaultOut = defaultRender.stdout
    writeFileSync(join(tempRoot, 'default.yaml'), defaultOut)
    const defaultAssert = assertDefaultRender(defaultOut)
    if (!defaultAssert.ok) {
      throw new Error(`default render assertions failed:\n- ${defaultAssert.failures.join('\n- ')}`)
    }
    log('default render assertions OK')

    const ingressValues = join(tempRoot, 'ingress-example.invalid.yaml')
    writeFileSync(
      ingressValues,
      [
        'ingress:',
        '  enabled: true',
        '  zuul: true',
        '  context: form-definition-service',
        '  hostName: example.invalid',
        '  waf:',
        '    enabled: false',
        '',
      ].join('\n'),
    )
    const ingressRender = runHelm(
      ['template', 'fds-e52', '.', '--namespace', 'egov', '-f', ingressValues],
      destChart,
    )
    if (ingressRender.code !== 0) {
      throw new Error(
        `helm template (ingress/zuul) failed: ${ingressRender.stderr || ingressRender.stdout}`,
      )
    }
    writeFileSync(join(tempRoot, 'ingress.yaml'), ingressRender.stdout)
    const ingressAssert = assertIngressZuulRender(ingressRender.stdout)
    if (!ingressAssert.ok) {
      throw new Error(`ingress render assertions failed:\n- ${ingressAssert.failures.join('\n- ')}`)
    }
    log('ingress/Zuul render assertions OK (path preserved, no rewrite)')

    // Schema presence check (static).
    const schemaPath = join(destChart, 'values.schema.json')
    if (!existsSync(schemaPath)) throw new Error('values.schema.json missing')
    JSON.parse(readFileSync(schemaPath, 'utf8'))
    log('values.schema.json parse OK')

    log('PASS — FDS Helm render-only verification completed')
    log('SUMMARY no-install no-upgrade no-kubectl no-push no-deploy')
    exitCode = 0
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    exitCode = 1
  } finally {
    if (tempRoot) {
      try {
        rmSync(tempRoot, { recursive: true, force: true })
        log('temp workspace removed')
      } catch (cleanupError) {
        fail(
          `temp cleanup failed: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`,
        )
        exitCode = 1
      }
    }
  }
  process.exitCode = exitCode
}

main()

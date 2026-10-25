/**
 * Unit E representative FormDefinition loader + SHA-256 drift guard.
 *
 * Illustrative / non-authoritative. Not a production package API.
 * Canonical bytes: Form-builder/acceptance/unit-e/unit-e-representative-definition.json
 * Provenance: remapped Unit D acceptance definition (FB-D22).
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FormDefinition } from '@citizen/form-contract'

import { deepFreezeJsonSafe } from '../src/definition/deep-freeze.js'

const here = dirname(fileURLToPath(import.meta.url))
const CANONICAL_DIR = join(here, '../../../acceptance/unit-e')

export const UNIT_E_ACCEPTANCE_SERVICE_ID = 'unit-e-technical-acceptance' as const
export const UNIT_E_ACCEPTANCE_VERSION = 1 as const
export const UNIT_E_ACCEPTANCE_ACTOR = 'unit-e-technical-actor' as const
export const UNIT_E_ACCEPTANCE_FIXTURE_SHA256 =
  '8847a0904c402b7b98822f96741234a0f93230d57f7ecf458f41b66e979c557e' as const

const JSON_PATH = join(CANONICAL_DIR, 'unit-e-representative-definition.json')
const SHA_PATH = join(CANONICAL_DIR, 'unit-e-representative-definition.sha256')
const MANIFEST_PATH = join(CANONICAL_DIR, 'contract-manifest.json')

function loadCanonicalBytes(): Buffer {
  return readFileSync(JSON_PATH)
}

export function unitERepresentativeSha256(): string {
  return createHash('sha256').update(loadCanonicalBytes()).digest('hex')
}

export function assertUnitEFixtureNotDrifted(): void {
  const sha = unitERepresentativeSha256()
  const expectedFile = readFileSync(SHA_PATH, 'utf8').trim()
  if (sha !== UNIT_E_ACCEPTANCE_FIXTURE_SHA256 || sha !== expectedFile) {
    throw new Error(
      `Unit E fixture SHA drift: computed=${sha} const=${UNIT_E_ACCEPTANCE_FIXTURE_SHA256} file=${expectedFile}`,
    )
  }
}

export function loadUnitEContractManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, unknown>
}

function loadDefinition(): FormDefinition {
  assertUnitEFixtureNotDrifted()
  const parsed = JSON.parse(loadCanonicalBytes().toString('utf8')) as FormDefinition
  if (
    parsed.serviceId !== UNIT_E_ACCEPTANCE_SERVICE_ID ||
    parsed.version !== UNIT_E_ACCEPTANCE_VERSION
  ) {
    throw new Error('Unit E fixture coordinates drifted from acceptance constants')
  }
  if (parsed.status !== 'draft') {
    throw new Error('Unit E fixture must start as draft')
  }
  deepFreezeJsonSafe(parsed)
  return parsed
}

/** Frozen representative draft used by Unit E acceptance. */
export const UNIT_E_ACCEPTANCE_DEFINITION: FormDefinition = loadDefinition()

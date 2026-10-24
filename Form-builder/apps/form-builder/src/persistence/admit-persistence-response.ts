import type { FormDefinition } from '@dg20/form-contract'

import { assertDefinitionIntegrity, cloneJsonSafeObject } from '../authoring/index.js'
import { AuthoringError } from '../authoring/types.js'
import { admitServiceId } from './admit-draft-coordinates.js'
import { admitStrongEtag } from './admit-strong-etag.js'

export type AdmitPersistenceResponseResult =
  | {
      readonly ok: true
      readonly definition: FormDefinition
      readonly etag: string
    }
  | { readonly ok: false }

export type AdmitClonedDraftFormDefinitionResult =
  | { readonly ok: true; readonly definition: FormDefinition }
  | {
      readonly ok: false
      readonly reason:
        'not_draft' | 'envelope_rejected' | 'integrity_failed' | 'coordinates_rejected'
    }

const ROOT_KEYS = [
  'serviceId',
  'version',
  'status',
  'jsonSchema',
  'uiSchema',
  'meta',
  'audit',
] as const

const META_KEYS = [
  'paletteProvenance',
  'bilingual',
  'prefillBindings',
  'integrationBindings',
  'workflowBindings',
  'progressiveSteps',
] as const

const AUDIT_REQUIRED = ['createdBy', 'createdAt'] as const
const AUDIT_OPTIONAL = ['submittedBy', 'approvedBy', 'publishedAt'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  try {
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  } catch {
    return false
  }
}

function readOwnEnumerableData(obj: object, key: string): unknown {
  try {
    const desc = Object.getOwnPropertyDescriptor(obj, key)
    if (!desc || desc.get !== undefined || desc.set !== undefined || desc.enumerable !== true) {
      return undefined
    }
    return desc.value
  } catch {
    return undefined
  }
}

function hasExactOwnEnumerableKeys(obj: object, expected: readonly string[]): boolean {
  try {
    const names = Object.keys(obj)
    if (names.length !== expected.length) {
      return false
    }
    for (const key of expected) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        return false
      }
      const desc = Object.getOwnPropertyDescriptor(obj, key)
      if (!desc || desc.get !== undefined || desc.set !== undefined || desc.enumerable !== true) {
        return false
      }
    }
    for (const name of names) {
      if (!expected.includes(name)) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

function isCleanNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

/** Unit C numeric FormDefinition.version: integer in 1..2147483647. */
function admitBodyVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 2_147_483_647
  )
}

function collectPropertyFieldIds(jsonSchema: unknown): Set<string> | null {
  if (!isPlainObject(jsonSchema)) {
    return null
  }
  const properties = readOwnEnumerableData(jsonSchema, 'properties')
  if (!isPlainObject(properties)) {
    return null
  }
  return new Set(Object.keys(properties))
}

/** Root schema keys plus governed nested provenance paths (family members). */
function collectAdmittedBindingFieldIds(jsonSchema: unknown, meta: unknown): Set<string> | null {
  const fieldIds = collectPropertyFieldIds(jsonSchema)
  if (fieldIds === null) {
    return null
  }
  if (!isPlainObject(meta)) {
    return fieldIds
  }
  const provenance = readOwnEnumerableData(meta, 'paletteProvenance')
  if (!Array.isArray(provenance)) {
    return fieldIds
  }
  for (const entry of provenance) {
    if (!isPlainObject(entry)) {
      continue
    }
    const fieldId = readOwnEnumerableData(entry, 'fieldId')
    if (typeof fieldId === 'string' && fieldId.length > 0) {
      fieldIds.add(fieldId)
    }
  }
  return fieldIds
}

function admitDenseArray(value: unknown, admitEntry: (entry: unknown) => boolean): boolean {
  if (!Array.isArray(value)) {
    return false
  }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return false
    }
    const lengthDesc = Object.getOwnPropertyDescriptor(value, 'length')
    if (
      !lengthDesc ||
      lengthDesc.get !== undefined ||
      lengthDesc.set !== undefined ||
      lengthDesc.enumerable !== false ||
      typeof lengthDesc.value !== 'number' ||
      !Number.isSafeInteger(lengthDesc.value) ||
      lengthDesc.value < 0
    ) {
      return false
    }
    const length = lengthDesc.value
    const names = Object.getOwnPropertyNames(value)
    const expected = new Set<string>(['length'])
    for (let index = 0; index < length; index += 1) {
      expected.add(String(index))
    }
    if (names.length !== expected.size) {
      return false
    }
    for (const name of names) {
      if (!expected.has(name)) {
        return false
      }
    }
    for (let index = 0; index < length; index += 1) {
      const desc = Object.getOwnPropertyDescriptor(value, String(index))
      if (!desc || desc.get !== undefined || desc.set !== undefined || desc.enumerable !== true) {
        return false
      }
      if (!admitEntry(desc.value)) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

function admitPrefillEntry(entry: unknown, fieldIds: ReadonlySet<string>): boolean {
  if (
    !isPlainObject(entry) ||
    !hasExactOwnEnumerableKeys(entry, ['fieldId', 'cafAttribute', 'confidenceMin'])
  ) {
    return false
  }
  const fieldId = readOwnEnumerableData(entry, 'fieldId')
  const cafAttribute = readOwnEnumerableData(entry, 'cafAttribute')
  const confidenceMin = readOwnEnumerableData(entry, 'confidenceMin')
  return (
    isCleanNonBlankString(fieldId) &&
    fieldIds.has(fieldId) &&
    isCleanNonBlankString(cafAttribute) &&
    typeof confidenceMin === 'number' &&
    Number.isFinite(confidenceMin) &&
    confidenceMin >= 0 &&
    confidenceMin <= 1
  )
}

function admitIntegrationEntry(entry: unknown, fieldIds: ReadonlySet<string>): boolean {
  if (
    !isPlainObject(entry) ||
    !hasExactOwnEnumerableKeys(entry, ['fieldId', 'adapterId', 'param', 'direction'])
  ) {
    return false
  }
  const fieldId = readOwnEnumerableData(entry, 'fieldId')
  const adapterId = readOwnEnumerableData(entry, 'adapterId')
  const param = readOwnEnumerableData(entry, 'param')
  const direction = readOwnEnumerableData(entry, 'direction')
  return (
    isCleanNonBlankString(fieldId) &&
    fieldIds.has(fieldId) &&
    isCleanNonBlankString(adapterId) &&
    isCleanNonBlankString(param) &&
    (direction === 'in' || direction === 'out')
  )
}

function admitWorkflowEntry(entry: unknown, fieldIds: ReadonlySet<string>): boolean {
  if (!isPlainObject(entry) || !hasExactOwnEnumerableKeys(entry, ['fieldId', 'stage'])) {
    return false
  }
  const fieldId = readOwnEnumerableData(entry, 'fieldId')
  const stage = readOwnEnumerableData(entry, 'stage')
  return isCleanNonBlankString(fieldId) && fieldIds.has(fieldId) && isCleanNonBlankString(stage)
}

function admitAudit(audit: unknown): boolean {
  if (!isPlainObject(audit)) {
    return false
  }
  try {
    const keys = Object.keys(audit)
    for (const key of keys) {
      if (
        !(AUDIT_REQUIRED as readonly string[]).includes(key) &&
        !(AUDIT_OPTIONAL as readonly string[]).includes(key)
      ) {
        return false
      }
    }
    for (const key of AUDIT_REQUIRED) {
      if (!Object.prototype.hasOwnProperty.call(audit, key)) {
        return false
      }
      const value = readOwnEnumerableData(audit, key)
      if (!isCleanNonBlankString(value)) {
        return false
      }
    }
    for (const key of AUDIT_OPTIONAL) {
      if (!Object.prototype.hasOwnProperty.call(audit, key)) {
        continue
      }
      const value = readOwnEnumerableData(audit, key)
      if (!isCleanNonBlankString(value)) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

function admitMeta(meta: unknown, fieldIds: ReadonlySet<string>): boolean {
  if (!isPlainObject(meta) || !hasExactOwnEnumerableKeys(meta, META_KEYS)) {
    return false
  }
  const bilingual = readOwnEnumerableData(meta, 'bilingual')
  if (!isPlainObject(bilingual)) {
    return false
  }
  const prefill = readOwnEnumerableData(meta, 'prefillBindings')
  const integration = readOwnEnumerableData(meta, 'integrationBindings')
  const workflow = readOwnEnumerableData(meta, 'workflowBindings')
  const provenance = readOwnEnumerableData(meta, 'paletteProvenance')
  const progressive = readOwnEnumerableData(meta, 'progressiveSteps')
  if (!Array.isArray(provenance) || !Array.isArray(progressive)) {
    return false
  }
  return (
    admitDenseArray(prefill, (entry) => admitPrefillEntry(entry, fieldIds)) &&
    admitDenseArray(integration, (entry) => admitIntegrationEntry(entry, fieldIds)) &&
    admitDenseArray(workflow, (entry) => admitWorkflowEntry(entry, fieldIds))
  )
}

/**
 * Admit an already-detached JSON-safe draft FormDefinition envelope (FB-D7.1.1).
 * Used for both outgoing create/replace bodies and incoming persistence responses.
 * Never mutates input; never invokes accessors.
 */
export function admitClonedDraftFormDefinition(
  cloned: unknown,
): AdmitClonedDraftFormDefinitionResult {
  try {
    if (!isPlainObject(cloned) || !hasExactOwnEnumerableKeys(cloned, ROOT_KEYS)) {
      return { ok: false, reason: 'envelope_rejected' }
    }

    const serviceIdRaw = readOwnEnumerableData(cloned, 'serviceId')
    const versionRaw = readOwnEnumerableData(cloned, 'version')
    const status = readOwnEnumerableData(cloned, 'status')

    const serviceId = admitServiceId(serviceIdRaw)
    if (!serviceId.ok) {
      return { ok: false, reason: 'coordinates_rejected' }
    }
    if (!admitBodyVersion(versionRaw)) {
      return { ok: false, reason: 'coordinates_rejected' }
    }
    if (status !== 'draft') {
      return { ok: false, reason: 'not_draft' }
    }

    const metaRaw = readOwnEnumerableData(cloned, 'meta')
    const fieldIds = collectAdmittedBindingFieldIds(
      readOwnEnumerableData(cloned, 'jsonSchema'),
      metaRaw,
    )
    if (fieldIds === null) {
      return { ok: false, reason: 'envelope_rejected' }
    }
    if (!admitMeta(metaRaw, fieldIds)) {
      return { ok: false, reason: 'envelope_rejected' }
    }
    if (!admitAudit(readOwnEnumerableData(cloned, 'audit'))) {
      return { ok: false, reason: 'envelope_rejected' }
    }

    const definition = cloned as unknown as FormDefinition
    try {
      assertDefinitionIntegrity(definition)
    } catch (error) {
      if (error instanceof AuthoringError) {
        return { ok: false, reason: 'integrity_failed' }
      }
      return { ok: false, reason: 'integrity_failed' }
    }

    return { ok: true, definition }
  } catch {
    return { ok: false, reason: 'envelope_rejected' }
  }
}

/**
 * Admit a successful draft persistence response body + ETag (FB-D7 / D7.1 / D7.1.1).
 * Clones before inspecting definition values; shared envelope admission with outgoing bodies.
 */
export function admitPersistenceSuccessResponse(args: {
  readonly body: unknown
  readonly etagHeader: string | null
  readonly expectedServiceId: string
  readonly expectedVersion: number
}): AdmitPersistenceResponseResult {
  try {
    const etagAdmitted = admitStrongEtag(args.etagHeader)
    if (!etagAdmitted.ok) {
      return { ok: false }
    }

    const cloned = cloneJsonSafeObject(args.body)
    if (!cloned.ok) {
      return { ok: false }
    }

    const admitted = admitClonedDraftFormDefinition(cloned.value)
    if (!admitted.ok) {
      return { ok: false }
    }
    if (admitted.definition.serviceId !== args.expectedServiceId) {
      return { ok: false }
    }
    if (admitted.definition.version !== args.expectedVersion) {
      return { ok: false }
    }

    return {
      ok: true,
      definition: admitted.definition,
      etag: etagAdmitted.etag,
    }
  } catch {
    return { ok: false }
  }
}

/**
 * Re-admit an injected persistence-port result before any Builder state mutation (FB-D7.1).
 */
export function admitPersistencePortResult(args: {
  readonly raw: unknown
  readonly expectedServiceId: string
  readonly expectedVersion: number
}): AdmitPersistenceResponseResult {
  try {
    if (!isPlainObject(args.raw) || !hasExactOwnEnumerableKeys(args.raw, ['definition', 'etag'])) {
      return { ok: false }
    }
    const definitionRaw = readOwnEnumerableData(args.raw, 'definition')
    const etagRaw = readOwnEnumerableData(args.raw, 'etag')
    if (typeof etagRaw !== 'string') {
      return { ok: false }
    }
    return admitPersistenceSuccessResponse({
      body: definitionRaw,
      etagHeader: etagRaw,
      expectedServiceId: args.expectedServiceId,
      expectedVersion: args.expectedVersion,
    })
  } catch {
    return { ok: false }
  }
}

import type { FormDefinition } from '@dg20/form-contract'

import { assertDefinitionIntegrity, cloneJsonSafeObject } from '../authoring/index.js'
import { admitServiceId } from '../persistence/admit-draft-coordinates.js'
import { admitStrongEtag } from '../persistence/admit-strong-etag.js'

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
const SUBMITTED_AUDIT_KEYS = ['createdBy', 'createdAt', 'submittedBy'] as const

export type AdmitLifecycleResponseResult =
  | { readonly ok: true; readonly definition: FormDefinition; readonly etag: string }
  | { readonly ok: false }

export type AdmitClonedSubmittedFormDefinitionResult =
  { readonly ok: true; readonly definition: FormDefinition } | { readonly ok: false }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
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
    return desc && desc.get === undefined && desc.set === undefined && desc.enumerable
      ? desc.value
      : undefined
  } catch {
    return undefined
  }
}

function hasExactOwnEnumerableKeys(obj: object, expected: readonly string[]): boolean {
  try {
    const names = Object.keys(obj)
    if (names.length !== expected.length) return false
    return expected.every((key) => {
      const desc = Object.getOwnPropertyDescriptor(obj, key)
      return (
        Object.prototype.hasOwnProperty.call(obj, key) &&
        desc !== undefined &&
        desc.get === undefined &&
        desc.set === undefined &&
        desc.enumerable === true
      )
    })
  } catch {
    return false
  }
}

function isCleanNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

function isUnitCVersion(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647
  )
}

/**
 * Admit a detached submitted definition. This intentionally has its own
 * envelope and audit policy; submission must never be admitted as a draft.
 */
export function admitClonedSubmittedFormDefinition(
  cloned: unknown,
): AdmitClonedSubmittedFormDefinitionResult {
  try {
    if (!isPlainObject(cloned) || !hasExactOwnEnumerableKeys(cloned, ROOT_KEYS))
      return { ok: false }
    if (!hasExactOwnEnumerableKeys(readOwnEnumerableData(cloned, 'meta') as object, META_KEYS)) {
      return { ok: false }
    }
    const audit = readOwnEnumerableData(cloned, 'audit')
    if (!isPlainObject(audit) || !hasExactOwnEnumerableKeys(audit, SUBMITTED_AUDIT_KEYS)) {
      return { ok: false }
    }
    if (
      !isCleanNonBlankString(readOwnEnumerableData(audit, 'createdBy')) ||
      !isCleanNonBlankString(readOwnEnumerableData(audit, 'createdAt')) ||
      !isCleanNonBlankString(readOwnEnumerableData(audit, 'submittedBy'))
    ) {
      return { ok: false }
    }
    const serviceId = admitServiceId(readOwnEnumerableData(cloned, 'serviceId'))
    if (!serviceId.ok || !isUnitCVersion(readOwnEnumerableData(cloned, 'version')))
      return { ok: false }
    if (readOwnEnumerableData(cloned, 'status') !== 'submitted') return { ok: false }
    const definition = cloned as unknown as FormDefinition
    assertDefinitionIntegrity(definition)
    return { ok: true, definition }
  } catch {
    return { ok: false }
  }
}

export function admitLifecycleSuccessResponse(args: {
  readonly body: unknown
  readonly etagHeader: string | null
  readonly expectedServiceId: string
  readonly expectedVersion: number
}): AdmitLifecycleResponseResult {
  try {
    const etag = admitStrongEtag(args.etagHeader)
    const cloned = cloneJsonSafeObject(args.body)
    if (!etag.ok || !cloned.ok) return { ok: false }
    const definition = admitClonedSubmittedFormDefinition(cloned.value)
    if (
      !definition.ok ||
      definition.definition.serviceId !== args.expectedServiceId ||
      definition.definition.version !== args.expectedVersion
    ) {
      return { ok: false }
    }
    return { ok: true, definition: definition.definition, etag: etag.etag }
  } catch {
    return { ok: false }
  }
}

/** Re-admit injected port results before lifecycle state can adopt them. */
export function admitLifecyclePortResult(args: {
  readonly raw: unknown
  readonly expectedServiceId: string
  readonly expectedVersion: number
}): AdmitLifecycleResponseResult {
  try {
    if (!isPlainObject(args.raw) || !hasExactOwnEnumerableKeys(args.raw, ['definition', 'etag'])) {
      return { ok: false }
    }
    const etag = readOwnEnumerableData(args.raw, 'etag')
    if (typeof etag !== 'string') return { ok: false }
    return admitLifecycleSuccessResponse({
      body: readOwnEnumerableData(args.raw, 'definition'),
      etagHeader: etag,
      expectedServiceId: args.expectedServiceId,
      expectedVersion: args.expectedVersion,
    })
  } catch {
    return { ok: false }
  }
}

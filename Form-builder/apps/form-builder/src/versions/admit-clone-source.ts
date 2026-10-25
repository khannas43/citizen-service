import type { FormDefinition } from '@citizen/form-contract'

import { assertDefinitionIntegrity, cloneJsonSafeObject } from '../authoring/index.js'
import { admitServiceId } from '../persistence/admit-draft-coordinates.js'
import { admitPersistenceSuccessResponse } from '../persistence/admit-persistence-response.js'
import { admitStrongEtag } from '../persistence/admit-strong-etag.js'

import type {
  CloneSourceReference,
  VersionListStatus,
} from './form-definition-version-management-adapter.js'

const STATUSES = new Set<VersionListStatus>([
  'draft',
  'submitted',
  'approved',
  'published',
  'retired',
])
const ROOT_KEYS = [
  'serviceId',
  'version',
  'status',
  'jsonSchema',
  'uiSchema',
  'meta',
  'audit',
] as const
const AUDIT_KEYS = ['createdBy', 'createdAt', 'submittedBy', 'approvedBy', 'publishedAt'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const names = Object.keys(value)
  return (
    names.length === keys.length &&
    names.every((name) => keys.includes(name)) &&
    keys.every((key) => {
      const desc = Object.getOwnPropertyDescriptor(value, key)
      return desc?.enumerable === true && desc.get === undefined && desc.set === undefined
    })
  )
}

function readData(value: object, key: string): unknown {
  const desc = Object.getOwnPropertyDescriptor(value, key)
  return desc?.enumerable === true && desc.get === undefined && desc.set === undefined
    ? desc.value
    : undefined
}

function isVersion(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647
  )
}

function isCleanNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

/**
 * Exact-document admission for immutable version operations. This is separate
 * from draft persistence admission so accepting another governed status cannot
 * weaken draft-only persistence.
 */
export function admitExactFormDefinition(args: {
  readonly body: unknown
  readonly etagHeader: string | null
  readonly expectedServiceId: string
  readonly expectedVersion: number
}):
  | { readonly ok: true; readonly definition: FormDefinition; readonly etag: string }
  | { readonly ok: false } {
  try {
    const etag = admitStrongEtag(args.etagHeader)
    const cloned = cloneJsonSafeObject(args.body)
    if (
      !etag.ok ||
      !cloned.ok ||
      !isPlainObject(cloned.value) ||
      !hasExactKeys(cloned.value, ROOT_KEYS)
    ) {
      return { ok: false }
    }
    const definition = cloned.value
    const serviceId = admitServiceId(readData(definition, 'serviceId'))
    const version = readData(definition, 'version')
    const status = readData(definition, 'status')
    const audit = readData(definition, 'audit')
    if (
      !serviceId.ok ||
      serviceId.serviceId !== args.expectedServiceId ||
      !isVersion(version) ||
      version !== args.expectedVersion ||
      !STATUSES.has(status as VersionListStatus) ||
      !isPlainObject(audit) ||
      !Object.keys(audit).every((key) => (AUDIT_KEYS as readonly string[]).includes(key)) ||
      !['createdBy', 'createdAt'].every((key) => isCleanNonBlankString(readData(audit, key)))
    ) {
      return { ok: false }
    }
    assertDefinitionIntegrity(definition as unknown as FormDefinition)
    return { ok: true, definition: definition as unknown as FormDefinition, etag: etag.etag }
  } catch {
    return { ok: false }
  }
}

export function admitCloneSourceReference(args: {
  readonly body: unknown
  readonly etagHeader: string | null
  readonly expectedServiceId: string
  readonly expectedVersion: number
}):
  | { readonly ok: true; readonly source: CloneSourceReference }
  | { readonly ok: false; readonly reason: 'source_not_cloneable' | 'response_rejected' } {
  const admitted = admitExactFormDefinition(args)
  if (!admitted.ok) return { ok: false, reason: 'response_rejected' }
  if (admitted.definition.status !== 'published' && admitted.definition.status !== 'retired') {
    return { ok: false, reason: 'source_not_cloneable' }
  }
  return {
    ok: true,
    source: {
      serviceId: admitted.definition.serviceId,
      version: admitted.definition.version,
      status: admitted.definition.status,
      etag: admitted.etag,
    },
  }
}

/** Clone returns a new draft only; it must not preserve lifecycle audit fields. */
export function admitCloneDraftResponse(args: {
  readonly body: unknown
  readonly etagHeader: string | null
  readonly expectedServiceId: string
  readonly sourceVersion: number
}):
  | { readonly ok: true; readonly definition: FormDefinition; readonly etag: string }
  | { readonly ok: false } {
  const cloned = cloneJsonSafeObject(args.body)
  if (!cloned.ok || !isPlainObject(cloned.value)) return { ok: false }
  const audit = readData(cloned.value, 'audit')
  if (
    !isPlainObject(audit) ||
    !hasExactKeys(audit, ['createdBy', 'createdAt']) ||
    !isCleanNonBlankString(readData(audit, 'createdBy')) ||
    !isCleanNonBlankString(readData(audit, 'createdAt'))
  ) {
    return { ok: false }
  }
  const version = readData(cloned.value, 'version')
  if (!isVersion(version) || version <= args.sourceVersion) return { ok: false }
  return admitPersistenceSuccessResponse({
    body: cloned.value,
    etagHeader: args.etagHeader,
    expectedServiceId: args.expectedServiceId,
    expectedVersion: version,
  })
}

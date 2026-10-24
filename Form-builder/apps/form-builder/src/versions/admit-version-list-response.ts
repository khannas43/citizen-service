import { cloneJsonSafeObject } from '../authoring/index.js'

import type {
  VersionListPage,
  VersionListStatus,
} from './form-definition-version-management-adapter.js'

const STATUSES = new Set<VersionListStatus>([
  'draft',
  'submitted',
  'approved',
  'published',
  'retired',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  } catch {
    return false
  }
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  try {
    const names = Object.keys(value)
    return (
      names.length === keys.length &&
      names.every((name) => keys.includes(name)) &&
      keys.every((key) => {
        const desc = Object.getOwnPropertyDescriptor(value, key)
        return desc?.enumerable === true && desc.get === undefined && desc.set === undefined
      })
    )
  } catch {
    return false
  }
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

function isDenseOrdinaryArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false
  const names = Object.getOwnPropertyNames(value)
  if (names.length !== value.length + 1 || !names.includes('length')) return false
  for (let index = 0; index < value.length; index += 1) {
    const desc = Object.getOwnPropertyDescriptor(value, String(index))
    if (!desc || desc.enumerable !== true || desc.get !== undefined || desc.set !== undefined)
      return false
  }
  return true
}

export type AdmitVersionListResponseResult =
  { readonly ok: true; readonly page: VersionListPage } | { readonly ok: false }

/** Admit a detached, cursor-consistent version listing response. */
export function admitVersionListResponse(args: {
  readonly body: unknown
  readonly expectedServiceId: string
  readonly afterVersion?: number
}): AdmitVersionListResponseResult {
  try {
    const cloned = cloneJsonSafeObject(args.body)
    if (!cloned.ok || !isPlainObject(cloned.value)) return { ok: false }
    const page = cloned.value
    const rootKeys = Object.prototype.hasOwnProperty.call(page, 'nextAfterVersion')
      ? ['serviceId', 'items', 'nextAfterVersion']
      : ['serviceId', 'items']
    if (!hasExactKeys(page, rootKeys) || readData(page, 'serviceId') !== args.expectedServiceId) {
      return { ok: false }
    }
    const items = readData(page, 'items')
    if (!isDenseOrdinaryArray(items) || items.length > 100) return { ok: false }
    let previous = args.afterVersion ?? 0
    for (const item of items) {
      if (!isPlainObject(item) || !hasExactKeys(item, ['version', 'status'])) return { ok: false }
      const version = readData(item, 'version')
      const status = readData(item, 'status')
      if (
        !isVersion(version) ||
        version <= previous ||
        !STATUSES.has(status as VersionListStatus)
      ) {
        return { ok: false }
      }
      previous = version
    }
    const rawNext = readData(page, 'nextAfterVersion')
    if (rawNext !== undefined) {
      if (
        !isVersion(rawNext) ||
        items.length === 0 ||
        rawNext !== previous ||
        (args.afterVersion !== undefined && rawNext <= args.afterVersion)
      ) {
        return { ok: false }
      }
    }
    return { ok: true, page: page as unknown as VersionListPage }
  } catch {
    return { ok: false }
  }
}

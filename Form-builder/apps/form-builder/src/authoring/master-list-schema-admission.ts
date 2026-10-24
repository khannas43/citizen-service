/**
 * Strict master-list widget schema admission (FB-D9).
 * Never repairs; never invokes accessors; never embeds hostile values in messages.
 */

export type XDg20AdmissionResult<T> =
  | { readonly kind: 'absent' }
  | { readonly kind: 'valid'; readonly value: T }
  | { readonly kind: 'invalid' }

function isOrdinaryJsonObject(value: unknown): value is Record<string, unknown> {
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

function readOwnDataProperty(obj: object, key: string): unknown {
  try {
    const desc = Object.getOwnPropertyDescriptor(obj, key)
    if (!desc || desc.get !== undefined || desc.set !== undefined) {
      return undefined
    }
    return desc.value
  } catch {
    return undefined
  }
}

function hasHostileOwnShape(obj: object): boolean {
  try {
    if (Object.getOwnPropertySymbols(obj).length > 0) {
      return true
    }
    const names = Object.getOwnPropertyNames(obj)
    const enumerable = Object.keys(obj)
    if (names.length !== enumerable.length) {
      return true
    }
    for (const key of names) {
      const desc = Object.getOwnPropertyDescriptor(obj, key)
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return true
      }
    }
    return false
  } catch {
    return true
  }
}

/**
 * Exact masterListId: nonblank string with no leading/trailing whitespace.
 * Preserved exactly — never trimmed. Not interpreted as a URL.
 */
export function isExactMasterListId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

/**
 * Admit `x-dg20` for dropdown-master / radio: exact `{ masterListId: <exact id> }`.
 * Absent is invalid for these widgets (required configuration).
 */
export function admitMasterListXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<{ readonly masterListId: string }> {
  if (!Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'invalid' }
  }
  const raw = readOwnDataProperty(schema as object, 'x-dg20')
  if (raw === undefined && Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'invalid' }
  }
  if (!isOrdinaryJsonObject(raw) || hasHostileOwnShape(raw)) {
    return { kind: 'invalid' }
  }
  const keys = Object.keys(raw)
  if (keys.length !== 1 || keys[0] !== 'masterListId') {
    return { kind: 'invalid' }
  }
  const masterListId = readOwnDataProperty(raw, 'masterListId')
  if (!isExactMasterListId(masterListId)) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', value: { masterListId } }
}

function isAdmittedMasterListSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'string') {
    return false
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'enum')) {
    return false
  }
  return admitMasterListXDg20(schema).kind === 'valid'
}

export type MasterListWidgetType = 'dropdown-master' | 'radio'

export function isMasterListWidgetType(widgetType: string): widgetType is MasterListWidgetType {
  return widgetType === 'dropdown-master' || widgetType === 'radio'
}

export function isAdmittedDropdownMasterSchema(schema: unknown): boolean {
  return isAdmittedMasterListSchema(schema)
}

export function isAdmittedRadioSchema(schema: unknown): boolean {
  return isAdmittedMasterListSchema(schema)
}

export function isAdmittedMasterListWidgetSchema(
  widgetType: MasterListWidgetType,
  schema: unknown,
): boolean {
  switch (widgetType) {
    case 'dropdown-master':
      return isAdmittedDropdownMasterSchema(schema)
    case 'radio':
      return isAdmittedRadioSchema(schema)
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      return false
    }
  }
}

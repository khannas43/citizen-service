/**
 * Strict caf-prefill schema admission (FB-D15).
 * Never repairs; never invokes accessors; never embeds hostile values in messages.
 */

export type CafPrefillWidgetType = 'caf-prefill'

const CAF_PROPERTIES = ['value', 'source'] as const
const CAF_SOURCE_ENUM = ['CAF', 'OVERRIDE'] as const

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

function hasExactPropertyMembers(
  properties: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(properties)
  if (keys.length !== expected.length) {
    return false
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) {
      return false
    }
  }
  return true
}

function admitExactRequiredMembers(
  requiredRaw: unknown,
  expectedMembers: readonly string[],
): boolean {
  if (!Array.isArray(requiredRaw)) {
    return false
  }
  try {
    if (Object.getOwnPropertySymbols(requiredRaw).length > 0) {
      return false
    }
    if (requiredRaw.length !== expectedMembers.length) {
      return false
    }
    const seen = new Set<string>()
    for (let i = 0; i < requiredRaw.length; i += 1) {
      const desc = Object.getOwnPropertyDescriptor(requiredRaw, String(i))
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return false
      }
      const item = desc.value
      if (typeof item !== 'string' || item !== expectedMembers[i]) {
        return false
      }
      if (seen.has(item)) {
        return false
      }
      seen.add(item)
    }
    return seen.size === expectedMembers.length
  } catch {
    return false
  }
}

function admitStringMinLengthOne(node: unknown): boolean {
  if (!isOrdinaryJsonObject(node) || hasHostileOwnShape(node)) {
    return false
  }
  return (
    readOwnDataProperty(node, 'type') === 'string' && readOwnDataProperty(node, 'minLength') === 1
  )
}

function admitExactOrderedStringEnum(node: unknown, expected: readonly string[]): boolean {
  if (!isOrdinaryJsonObject(node) || hasHostileOwnShape(node)) {
    return false
  }
  if (readOwnDataProperty(node, 'type') !== 'string') {
    return false
  }
  const enumRaw = readOwnDataProperty(node, 'enum')
  if (!Array.isArray(enumRaw)) {
    return false
  }
  try {
    if (Object.getOwnPropertySymbols(enumRaw).length > 0) {
      return false
    }
    if (enumRaw.length !== expected.length) {
      return false
    }
    for (let i = 0; i < expected.length; i += 1) {
      const desc = Object.getOwnPropertyDescriptor(enumRaw, String(i))
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return false
      }
      if (desc.value !== expected[i]) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

export function isAdmittedCafPrefillSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (
    !isOrdinaryJsonObject(propertiesRaw) ||
    hasHostileOwnShape(propertiesRaw) ||
    !hasExactPropertyMembers(propertiesRaw, CAF_PROPERTIES)
  ) {
    return false
  }
  if (!admitStringMinLengthOne(readOwnDataProperty(propertiesRaw, 'value'))) {
    return false
  }
  if (!admitExactOrderedStringEnum(readOwnDataProperty(propertiesRaw, 'source'), CAF_SOURCE_ENUM)) {
    return false
  }
  if (!admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), CAF_PROPERTIES)) {
    return false
  }
  return true
}

export function isCafPrefillWidgetType(widgetType: string): widgetType is CafPrefillWidgetType {
  return widgetType === 'caf-prefill'
}

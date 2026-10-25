/**
 * Strict family-repeater schema / field admission (FB-D16).
 * Never repairs; never invokes accessors; never embeds hostile values in messages.
 */

import type { FormDefinition } from '@citizen/form-contract'
import {
  dg20Fields,
  dg20Widgets,
  FAMILY_REPEATER_GLOBAL_MAX_ROWS,
  getPaletteWidget,
  isApprovedWidgetType,
} from '@citizen/form-widgets'

import { isAdmittedCitizenSchema, isCitizenWidgetType } from './citizen-schema-admission.js'
import { isFamilyMemberWidgetType, type FamilyMemberWidgetType } from './family-member-types.js'
import { familyMemberDefinitionPath } from './family-repeater-paths.js'
import { AuthoringError } from './types.js'

export type FamilyRepeaterWidgetType = 'family-repeater'

export function isFamilyRepeaterWidgetType(
  widgetType: string,
): widgetType is FamilyRepeaterWidgetType {
  return widgetType === 'family-repeater'
}

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

function isPositiveSafeIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function admitDenseUniqueKnownStrings(
  requiredRaw: unknown,
  knownPropertyNames: ReadonlySet<string>,
): boolean {
  if (requiredRaw === undefined) {
    return true
  }
  if (!Array.isArray(requiredRaw)) {
    return false
  }
  try {
    if (Object.getOwnPropertySymbols(requiredRaw).length > 0) {
      return false
    }
    const seen = new Set<string>()
    for (let i = 0; i < requiredRaw.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(requiredRaw, i)) {
        return false
      }
      const desc = Object.getOwnPropertyDescriptor(requiredRaw, String(i))
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return false
      }
      const item = desc.value
      if (typeof item !== 'string' || item.length === 0 || item !== item.trim()) {
        return false
      }
      if (!knownPropertyNames.has(item) || seen.has(item)) {
        return false
      }
      seen.add(item)
    }
    return true
  } catch {
    return false
  }
}

function admitExactEnum(node: unknown, expected: readonly string[]): boolean {
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

/**
 * Admit a Builder-supported family member child schema.
 */
export function isAdmittedFamilyMemberChildSchema(
  widgetType: FamilyMemberWidgetType,
  schema: unknown,
): boolean {
  if (widgetType === 'email' || widgetType === 'dob') {
    return isAdmittedCitizenSchema(widgetType, schema)
  }
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  switch (widgetType) {
    case 'text-short':
    case 'text-long':
      return readOwnDataProperty(schema, 'type') === 'string'
    case 'number':
    case 'currency-inr':
    case 'percentage':
      return readOwnDataProperty(schema, 'type') === 'number'
    case 'gender':
      return admitExactEnum(schema, ['M', 'F', 'OTHER'])
    case 'yesno':
      return readOwnDataProperty(schema, 'type') === 'boolean'
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      return false
    }
  }
}

function isSoftAdmittedChildSchemaObject(schema: unknown): boolean {
  return isOrdinaryJsonObject(schema) && !hasHostileOwnShape(schema)
}

export type FamilyRepeaterSchemaAdmission =
  | {
      readonly ok: true
      readonly propertyKeys: readonly string[]
      readonly minItems: number
      readonly maxItems: number
      readonly requiredMembers: readonly string[]
    }
  | {
      readonly ok: false
    }

/**
 * Schema-only admission for a family-repeater root field schema.
 * Does not inspect uiSchema or child widget types.
 */
export function admitFamilyRepeaterSchema(schema: unknown): FamilyRepeaterSchemaAdmission {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return { ok: false }
  }
  if (readOwnDataProperty(schema, 'type') !== 'array') {
    return { ok: false }
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { ok: false }
  }

  const itemsRaw = readOwnDataProperty(schema, 'items')
  if (Array.isArray(itemsRaw)) {
    return { ok: false }
  }
  if (!isOrdinaryJsonObject(itemsRaw) || hasHostileOwnShape(itemsRaw)) {
    return { ok: false }
  }
  if (readOwnDataProperty(itemsRaw, 'type') !== 'object') {
    return { ok: false }
  }
  if (readOwnDataProperty(itemsRaw, 'additionalProperties') !== false) {
    return { ok: false }
  }

  const propertiesRaw = readOwnDataProperty(itemsRaw, 'properties')
  if (!isOrdinaryJsonObject(propertiesRaw) || hasHostileOwnShape(propertiesRaw)) {
    return { ok: false }
  }
  const propertyKeys = Object.keys(propertiesRaw)
  if (propertyKeys.length === 0) {
    return { ok: false }
  }
  for (const key of propertyKeys) {
    if (typeof key !== 'string' || key.length === 0 || key !== key.trim()) {
      return { ok: false }
    }
  }
  const propertyKeySet = new Set(propertyKeys)

  const maxItems = readOwnDataProperty(schema, 'maxItems')
  if (!isPositiveSafeIntegerInRange(maxItems, 1, FAMILY_REPEATER_GLOBAL_MAX_ROWS)) {
    return { ok: false }
  }

  const minRaw = readOwnDataProperty(schema, 'minItems')
  let minItems = 0
  if (minRaw !== undefined) {
    if (!isNonnegativeSafeInteger(minRaw) || minRaw > maxItems) {
      return { ok: false }
    }
    minItems = minRaw
  }

  const requiredRaw = readOwnDataProperty(itemsRaw, 'required')
  if (!admitDenseUniqueKnownStrings(requiredRaw, propertyKeySet)) {
    return { ok: false }
  }
  const requiredMembers: string[] = []
  if (Array.isArray(requiredRaw)) {
    for (let i = 0; i < requiredRaw.length; i += 1) {
      const desc = Object.getOwnPropertyDescriptor(requiredRaw, String(i))
      if (desc && typeof desc.value === 'string') {
        requiredMembers.push(desc.value)
      }
    }
  }

  return { ok: true, propertyKeys, minItems, maxItems, requiredMembers }
}

export function isAdmittedFamilyRepeaterSchema(schema: unknown): boolean {
  return admitFamilyRepeaterSchema(schema).ok
}

function readUiItemsMap(uiEntry: Record<string, unknown>): Record<string, unknown> | undefined {
  const itemsRaw = readOwnDataProperty(uiEntry, 'items')
  if (!isOrdinaryJsonObject(itemsRaw) || hasHostileOwnShape(itemsRaw)) {
    return undefined
  }
  return itemsRaw
}

function admitChildUiWidget(uiChild: unknown, expectedWidgetType: string): boolean {
  if (!isOrdinaryJsonObject(uiChild) || hasHostileOwnShape(uiChild)) {
    return false
  }
  const inWidgets = Object.prototype.hasOwnProperty.call(dg20Widgets, expectedWidgetType)
  const inFields = Object.prototype.hasOwnProperty.call(dg20Fields, expectedWidgetType)
  if (inWidgets === inFields) {
    return false
  }
  const expectedKey = inWidgets ? 'ui:widget' : 'ui:field'
  const otherKey = expectedKey === 'ui:widget' ? 'ui:field' : 'ui:widget'
  if (readOwnDataProperty(uiChild, expectedKey) !== expectedWidgetType) {
    return false
  }
  if (readOwnDataProperty(uiChild, otherKey) !== undefined) {
    return false
  }
  return true
}

export type FamilyRepeaterChildAdmissionMode = 'builder-authored' | 'external-soft'

/**
 * Resolve whether a family-repeater's children are all Builder-supported members.
 */
export function resolveFamilyRepeaterChildAdmissionMode(
  childWidgetTypes: readonly string[],
): FamilyRepeaterChildAdmissionMode {
  for (const widgetType of childWidgetTypes) {
    if (!isFamilyMemberWidgetType(widgetType)) {
      return 'external-soft'
    }
  }
  return 'builder-authored'
}

/**
 * Full field check: schema + uiSchema.items + child schemas via provenance.
 * Throws {@link AuthoringError}(`inconsistent_definition`) on failure.
 */
export function assertFamilyRepeaterFieldGoverned(
  definition: FormDefinition,
  fieldId: string,
): void {
  const propertiesRaw = definition.jsonSchema['properties']
  if (!isOrdinaryJsonObject(propertiesRaw)) {
    throw new AuthoringError('inconsistent_definition', 'jsonSchema.properties must be an object')
  }
  const schemaRaw = readOwnDataProperty(propertiesRaw, fieldId)
  const admitted = admitFamilyRepeaterSchema(schemaRaw)
  if (!admitted.ok) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater field schema does not match governed invariants',
    )
  }
  const propertyKeys = admitted.propertyKeys

  if (!isOrdinaryJsonObject(schemaRaw)) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater field schema does not match governed invariants',
    )
  }
  const itemsNode = readOwnDataProperty(schemaRaw, 'items')
  if (!isOrdinaryJsonObject(itemsNode)) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater field schema does not match governed invariants',
    )
  }
  const itemsObjectRaw = readOwnDataProperty(itemsNode, 'properties')
  if (!isOrdinaryJsonObject(itemsObjectRaw)) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater field schema does not match governed invariants',
    )
  }
  const itemsObject = itemsObjectRaw

  const uiEntryRaw = definition.uiSchema[fieldId]
  if (!isOrdinaryJsonObject(uiEntryRaw) || hasHostileOwnShape(uiEntryRaw)) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater uiSchema entry must be an object',
    )
  }
  if (readOwnDataProperty(uiEntryRaw, 'ui:field') !== 'family-repeater') {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater uiSchema must declare ui:field family-repeater',
    )
  }
  if (readOwnDataProperty(uiEntryRaw, 'ui:widget') !== undefined) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater uiSchema must not declare ui:widget',
    )
  }

  const uiItems = readUiItemsMap(uiEntryRaw)
  if (uiItems === undefined) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater uiSchema.items must be an object',
    )
  }
  const uiItemKeys = Object.keys(uiItems)
  if (uiItemKeys.length !== propertyKeys.length) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater uiSchema.items must cover every property exactly once',
    )
  }
  for (const key of propertyKeys) {
    if (!Object.prototype.hasOwnProperty.call(uiItems, key)) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Family repeater uiSchema.items missing a member property',
      )
    }
  }
  for (const key of uiItemKeys) {
    if (!propertyKeys.includes(key)) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Family repeater uiSchema.items references unknown member property',
      )
    }
  }

  const provenance = definition.meta.paletteProvenance
  const childWidgetTypes: string[] = []
  for (const propertyName of propertyKeys) {
    const nestedPath = familyMemberDefinitionPath(fieldId, propertyName)
    const entry = provenance.find((p) => p.fieldId === nestedPath)
    if (entry === undefined) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Family repeater member missing from paletteProvenance',
      )
    }
    const memberWidgetType = entry.widgetType
    if (!isApprovedWidgetType(memberWidgetType) || !getPaletteWidget(memberWidgetType)) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Family repeater member widgetType is not in the controlled palette',
      )
    }
    if (isFamilyRepeaterWidgetType(memberWidgetType)) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Nested family-repeater members are not admitted',
      )
    }
    childWidgetTypes.push(memberWidgetType)
    if (!admitChildUiWidget(uiItems[propertyName], memberWidgetType)) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Family repeater uiSchema.items widget binding mismatch',
      )
    }
  }

  const mode = resolveFamilyRepeaterChildAdmissionMode(childWidgetTypes)
  for (let index = 0; index < propertyKeys.length; index += 1) {
    const propertyName = propertyKeys[index]!
    const widgetType = childWidgetTypes[index]!
    const childSchema = readOwnDataProperty(itemsObject, propertyName)
    if (mode === 'builder-authored') {
      if (!isFamilyMemberWidgetType(widgetType)) {
        throw new AuthoringError(
          'inconsistent_definition',
          'Builder-authored family repeater member widgetType is not supported',
        )
      }
      if (!isAdmittedFamilyMemberChildSchema(widgetType, childSchema)) {
        throw new AuthoringError(
          'inconsistent_definition',
          'Family repeater member schema does not match governed invariants',
        )
      }
      continue
    }
    if (!isSoftAdmittedChildSchemaObject(childSchema)) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Family repeater member schema must be a plain JSON object',
      )
    }
    if (
      isFamilyMemberWidgetType(widgetType) &&
      !isAdmittedFamilyMemberChildSchema(widgetType, childSchema)
    ) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Family repeater member schema does not match governed invariants',
      )
    }
    if (
      isCitizenWidgetType(widgetType) &&
      (widgetType === 'email' || widgetType === 'dob') &&
      !isAdmittedCitizenSchema(widgetType, childSchema)
    ) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Family repeater member schema does not match governed invariants',
      )
    }
  }
}

/**
 * Collect nested member definition paths for every root family-repeater.
 * Returns empty when schema is not admitted (caller treats as integrity failure separately).
 */
export function collectFamilyRepeaterNestedPaths(
  definition: FormDefinition,
): ReadonlyMap<string, { readonly repeaterFieldId: string; readonly propertyName: string }> {
  const result = new Map<
    string,
    { readonly repeaterFieldId: string; readonly propertyName: string }
  >()
  const propertiesRaw = definition.jsonSchema['properties']
  if (!isOrdinaryJsonObject(propertiesRaw)) {
    return result
  }
  const provenanceByField = new Map<string, string>()
  for (const entry of definition.meta.paletteProvenance) {
    provenanceByField.set(entry.fieldId, entry.widgetType)
  }

  for (const fieldId of Object.keys(propertiesRaw)) {
    if (provenanceByField.get(fieldId) !== 'family-repeater') {
      continue
    }
    const admitted = admitFamilyRepeaterSchema(readOwnDataProperty(propertiesRaw, fieldId))
    if (!admitted.ok) {
      continue
    }
    for (const propertyName of admitted.propertyKeys) {
      const path = familyMemberDefinitionPath(fieldId, propertyName)
      result.set(path, { repeaterFieldId: fieldId, propertyName })
    }
  }
  return result
}

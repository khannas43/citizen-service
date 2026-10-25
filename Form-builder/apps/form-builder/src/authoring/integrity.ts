import type { FormDefinition, ProgressiveStep } from '@citizen/form-contract'
import { dg20Fields, dg20Widgets, getPaletteWidget, isApprovedWidgetType } from '@citizen/form-widgets'

import { isAdmittedCitizenSchema, isCitizenWidgetType } from './citizen-schema-admission.js'
import {
  isAdmittedGovernedMasterDataSchema,
  isGovernedMasterDataWidgetType,
} from './master-data-schema-admission.js'
import {
  isAdmittedAddressPhotoSchema,
  isAddressPhotoWidgetType,
} from './address-photo-schema-admission.js'
import {
  isAdmittedDocDigiLockerSchema,
  isDocDigiLockerWidgetType,
} from './doc-digilocker-schema-admission.js'
import { isAdmittedFeeEsignSchema, isFeeEsignWidgetType } from './fee-esign-schema-admission.js'
import {
  isAdmittedEligibilityDeclarationSchema,
  isEligibilityDeclarationWidgetType,
} from './eligibility-declaration-schema-admission.js'
import {
  isAdmittedCafPrefillSchema,
  isCafPrefillWidgetType,
} from './caf-prefill-schema-admission.js'
import {
  assertFamilyRepeaterFieldGoverned,
  collectFamilyRepeaterNestedPaths,
  isFamilyRepeaterWidgetType,
} from './family-repeater-schema-admission.js'
import { multiselectSchemaSatisfiesRootRequiredMinItems } from './multiselect-bounds.js'
import { AuthoringError } from './types.js'

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

/** Non-blank and not padded with leading/trailing whitespace. */
function isCleanNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

function fail(message: string): never {
  throw new AuthoringError('inconsistent_definition', message)
}

/**
 * Read an own data property without invoking accessors. Returns `undefined`
 * when the key is missing, is an accessor, or inspection itself fails.
 */
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

/**
 * Runtime guard for governed bilingual pairs (FB-D1.2).
 *
 * Accepts only a plain / null-prototype JSON object whose exact own enumerable
 * string keys are `en` and `gu`, both nonblank and unpadded strings. Rejects
 * missing/extra keys, arrays, null, primitives, and hostile shapes without
 * invoking accessors.
 */
export function isExactLocalizedPair(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false
  }
  try {
    const keys = Object.keys(value)
    if (keys.length !== 2) {
      return false
    }
    // Exact key set — reject any unexpected own enumerable key.
    for (const key of keys) {
      if (key !== 'en' && key !== 'gu') {
        return false
      }
    }
    if (!Object.prototype.hasOwnProperty.call(value, 'en')) {
      return false
    }
    if (!Object.prototype.hasOwnProperty.call(value, 'gu')) {
      return false
    }
    const en = readOwnDataProperty(value, 'en')
    const gu = readOwnDataProperty(value, 'gu')
    return isCleanNonBlank(en) && isCleanNonBlank(gu)
  } catch {
    return false
  }
}

function hasExactOwnKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  if (keys.length !== expected.length) {
    return false
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      return false
    }
  }
  for (const key of keys) {
    if (!expected.includes(key)) {
      return false
    }
  }
  return true
}

/**
 * Labels: exact coverage of required keys (roots + nested family-repeater members).
 * Help/errors: optional subset of allowed keys (roots + nested members).
 */
function assertLocalizedBucket(
  bucketName: 'labels' | 'help' | 'errors',
  bucket: unknown,
  allowedKeySet: ReadonlySet<string>,
  requiredKeySet: ReadonlySet<string>,
): void {
  if (!isPlainObject(bucket)) {
    fail(`bilingual.${bucketName} must be an object`)
  }
  const keys = Object.keys(bucket)
  for (const key of keys) {
    if (!allowedKeySet.has(key)) {
      fail(`bilingual.${bucketName} references unknown field`)
    }
    if (!isExactLocalizedPair(bucket[key])) {
      fail(`bilingual.${bucketName} entry must be an exact {en, gu} localized pair`)
    }
  }
  for (const key of requiredKeySet) {
    if (!Object.prototype.hasOwnProperty.call(bucket, key)) {
      fail(`bilingual.${bucketName} missing entry for a governed field`)
    }
  }
}

function assertDefinitionIntegrityInner(definition: FormDefinition): void {
  if (!isPlainObject(definition as unknown)) {
    fail('definition must be an object')
  }

  const jsonSchema = (definition as { jsonSchema?: unknown }).jsonSchema
  if (!isPlainObject(jsonSchema)) {
    fail('jsonSchema must be an object')
  }
  const uiSchema = (definition as { uiSchema?: unknown }).uiSchema
  if (!isPlainObject(uiSchema)) {
    fail('uiSchema must be an object')
  }
  const meta = (definition as { meta?: unknown }).meta
  if (!isPlainObject(meta)) {
    fail('meta must be an object')
  }
  const bilingual = (meta as { bilingual?: unknown }).bilingual
  if (!isPlainObject(bilingual)) {
    fail('meta.bilingual must be an object')
  }

  const propertiesRaw = jsonSchema['properties']
  if (!isPlainObject(propertiesRaw)) {
    fail('jsonSchema.properties must be an object')
  }
  const propertyKeys = Object.keys(propertiesRaw)
  if (propertyKeys.length === 0) {
    fail('jsonSchema.properties must declare at least one field')
  }
  for (const key of propertyKeys) {
    if (!isCleanNonBlank(key)) {
      fail('property IDs must be nonblank and unpadded')
    }
  }
  const propertyKeySet = new Set(propertyKeys)

  // ---- ui:order: exact cover, once each -------------------------------
  const uiOrderRaw = uiSchema['ui:order']
  if (!Array.isArray(uiOrderRaw)) {
    fail('uiSchema.ui:order must be an array')
  }
  const uiOrder: string[] = []
  for (let index = 0; index < uiOrderRaw.length; index += 1) {
    const item = uiOrderRaw[index]
    if (!isCleanNonBlank(item)) {
      fail(`ui:order[${index}] must be a nonblank, unpadded string`)
    }
    uiOrder.push(item)
  }
  if (uiOrder.length !== propertyKeys.length) {
    fail('ui:order must list every root property exactly once')
  }
  const orderSeen = new Set<string>()
  for (const key of uiOrder) {
    if (orderSeen.has(key)) {
      fail(`Duplicate ui:order entry: ${key}`)
    }
    orderSeen.add(key)
    if (!propertyKeySet.has(key)) {
      fail(`ui:order references unknown property: ${key}`)
    }
  }

  // ---- paletteProvenance: roots exact once + optional nested members ----
  const provenanceRaw = (meta as { paletteProvenance?: unknown }).paletteProvenance
  if (!Array.isArray(provenanceRaw) || provenanceRaw.length < propertyKeys.length) {
    fail('paletteProvenance must cover every root property exactly once')
  }
  const provenanceByField = new Map<string, string>()
  for (const entry of provenanceRaw) {
    if (!isPlainObject(entry) || !hasExactOwnKeys(entry, ['fieldId', 'widgetType'])) {
      fail('paletteProvenance entries must have exact keys fieldId and widgetType')
    }
    const fieldId = readOwnDataProperty(entry, 'fieldId')
    const widgetType = readOwnDataProperty(entry, 'widgetType')
    if (!isCleanNonBlank(fieldId) || !isCleanNonBlank(widgetType)) {
      fail('paletteProvenance fieldId and widgetType must be nonblank and unpadded')
    }
    if (provenanceByField.has(fieldId)) {
      fail(`Duplicate palette provenance: ${fieldId}`)
    }
    if (!isApprovedWidgetType(widgetType)) {
      fail(`paletteProvenance widgetType is not in the controlled palette`)
    }
    provenanceByField.set(fieldId, widgetType)
  }
  for (const key of propertyKeys) {
    if (!provenanceByField.has(key)) {
      fail(`Field missing from paletteProvenance: ${key}`)
    }
  }

  // Nested paths are validated after family-repeater schema admission below.
  const nestedPathCandidates = new Map<string, string>()
  for (const [fieldId, widgetType] of provenanceByField) {
    if (propertyKeySet.has(fieldId)) {
      continue
    }
    nestedPathCandidates.set(fieldId, widgetType)
  }

  // ---- uiSchema binding must match provenance widgetType + RJSF registry kind
  for (const key of propertyKeys) {
    const widgetType = provenanceByField.get(key)
    if (widgetType === undefined) {
      fail(`Field missing from paletteProvenance: ${key}`)
    }
    const palette = getPaletteWidget(widgetType)
    if (!palette) {
      fail(`Unknown palette widget type`)
    }
    const uiEntryRaw = uiSchema[key]
    if (!isPlainObject(uiEntryRaw)) {
      fail(`uiSchema entry for a field must be an object`)
    }
    const inWidgets = Object.prototype.hasOwnProperty.call(dg20Widgets, widgetType)
    const inFields = Object.prototype.hasOwnProperty.call(dg20Fields, widgetType)
    if (inWidgets === inFields) {
      fail(`widgetType must resolve to exactly one RJSF registry map`)
    }
    const expectedKey = inWidgets ? 'ui:widget' : 'ui:field'
    const otherKey = expectedKey === 'ui:widget' ? 'ui:field' : 'ui:widget'
    if (uiEntryRaw[expectedKey] !== widgetType) {
      fail(`uiSchema field must declare the matching ${expectedKey}`)
    }
    if (uiEntryRaw[otherKey] !== undefined) {
      fail(`uiSchema field must not declare ${otherKey} alongside ${expectedKey}`)
    }
    void palette
  }

  // ---- citizen-field baked schema invariants (FB-D5.1)
  for (const key of propertyKeys) {
    const widgetType = provenanceByField.get(key)
    if (widgetType === undefined || !isCitizenWidgetType(widgetType)) {
      continue
    }
    const schemaRaw = propertiesRaw[key]
    if (!isAdmittedCitizenSchema(widgetType, schemaRaw)) {
      fail('Citizen field schema does not match governed invariants')
    }
  }

  // ---- master-data widget schema invariants (FB-D9 / FB-D10)
  for (const key of propertyKeys) {
    const widgetType = provenanceByField.get(key)
    if (widgetType === undefined || !isGovernedMasterDataWidgetType(widgetType)) {
      continue
    }
    const schemaRaw = propertiesRaw[key]
    if (!isAdmittedGovernedMasterDataSchema(widgetType, schemaRaw)) {
      fail('Master-data field schema does not match governed invariants')
    }
  }

  // ---- address / photo schema invariants (FB-D11)
  for (const key of propertyKeys) {
    const widgetType = provenanceByField.get(key)
    if (widgetType === undefined || !isAddressPhotoWidgetType(widgetType)) {
      continue
    }
    const schemaRaw = propertiesRaw[key]
    if (!isAdmittedAddressPhotoSchema(widgetType, schemaRaw)) {
      fail('Address/photo field schema does not match governed invariants')
    }
  }

  // ---- document / DigiLocker schema invariants (FB-D12)
  for (const key of propertyKeys) {
    const widgetType = provenanceByField.get(key)
    if (widgetType === undefined || !isDocDigiLockerWidgetType(widgetType)) {
      continue
    }
    const schemaRaw = propertiesRaw[key]
    if (!isAdmittedDocDigiLockerSchema(widgetType, schemaRaw)) {
      fail('Document/DigiLocker field schema does not match governed invariants')
    }
  }

  // ---- fee / eSign schema invariants (FB-D13)
  for (const key of propertyKeys) {
    const widgetType = provenanceByField.get(key)
    if (widgetType === undefined || !isFeeEsignWidgetType(widgetType)) {
      continue
    }
    const schemaRaw = propertiesRaw[key]
    if (!isAdmittedFeeEsignSchema(widgetType, schemaRaw)) {
      fail('Fee/eSign field schema does not match governed invariants')
    }
  }

  // ---- eligibility-declaration schema invariants (FB-D14)
  for (const key of propertyKeys) {
    const widgetType = provenanceByField.get(key)
    if (widgetType === undefined || !isEligibilityDeclarationWidgetType(widgetType)) {
      continue
    }
    const schemaRaw = propertiesRaw[key]
    if (!isAdmittedEligibilityDeclarationSchema(schemaRaw)) {
      fail('Eligibility declaration field schema does not match governed invariants')
    }
  }

  // ---- caf-prefill schema invariants (FB-D15)
  for (const key of propertyKeys) {
    const widgetType = provenanceByField.get(key)
    if (widgetType === undefined || !isCafPrefillWidgetType(widgetType)) {
      continue
    }
    const schemaRaw = propertiesRaw[key]
    if (!isAdmittedCafPrefillSchema(schemaRaw)) {
      fail('CAF prefill field schema does not match governed invariants')
    }
  }

  // ---- family-repeater schema + nested path invariants (FB-D16)
  for (const key of propertyKeys) {
    const widgetType = provenanceByField.get(key)
    if (widgetType === undefined || !isFamilyRepeaterWidgetType(widgetType)) {
      continue
    }
    assertFamilyRepeaterFieldGoverned(definition, key)
  }

  const nestedPaths = collectFamilyRepeaterNestedPaths(definition)
  for (const [path, widgetType] of nestedPathCandidates) {
    if (!nestedPaths.has(path)) {
      fail(`paletteProvenance references unknown nested field: ${path}`)
    }
    void widgetType
  }
  for (const path of nestedPaths.keys()) {
    if (!provenanceByField.has(path)) {
      fail(`Family repeater member missing from paletteProvenance: ${path}`)
    }
  }

  const allowedBilingualKeys = new Set<string>(propertyKeys)
  for (const path of nestedPaths.keys()) {
    allowedBilingualKeys.add(path)
  }
  // Labels required for every root and every nested family-repeater member.
  const requiredLabelKeys = allowedBilingualKeys

  // ---- required: unique, existing, clean IDs, only supportsRequired widgets
  const requiredRaw = jsonSchema['required']
  const requiredSeen = new Set<string>()
  if (requiredRaw !== undefined) {
    if (!Array.isArray(requiredRaw)) {
      fail('jsonSchema.required must be an array when present')
    }
    for (const item of requiredRaw) {
      if (!isCleanNonBlank(item)) {
        fail('jsonSchema.required entries must be nonblank, unpadded strings')
      }
      if (requiredSeen.has(item)) {
        fail(`Duplicate required entry`)
      }
      requiredSeen.add(item)
      if (!propertyKeySet.has(item)) {
        fail(`required references unknown field`)
      }
      const widgetType = provenanceByField.get(item)
      const palette = widgetType !== undefined ? getPaletteWidget(widgetType) : undefined
      if (!palette?.supportsRequired) {
        fail(`required entry uses a widget type that does not support required`)
      }
    }
  }

  // ---- FB-D10.1: root-required multiselect must serialize explicit minItems >= 1
  for (const fieldId of requiredSeen) {
    if (provenanceByField.get(fieldId) !== 'multiselect') {
      continue
    }
    const schemaRaw = propertiesRaw[fieldId]
    if (
      schemaRaw === null ||
      typeof schemaRaw !== 'object' ||
      Array.isArray(schemaRaw) ||
      !multiselectSchemaSatisfiesRootRequiredMinItems(schemaRaw as Record<string, unknown>)
    ) {
      fail('Required multiselect schema must include explicit minItems >= 1')
    }
  }

  // ---- bilingual buckets ------------------------------------------------
  assertLocalizedBucket('labels', bilingual['labels'], allowedBilingualKeys, requiredLabelKeys)
  assertLocalizedBucket('help', bilingual['help'], allowedBilingualKeys, new Set())
  assertLocalizedBucket('errors', bilingual['errors'], allowedBilingualKeys, new Set())

  // ---- progressiveSteps -------------------------------------------------
  const stepsRaw = (meta as { progressiveSteps?: unknown }).progressiveSteps
  if (stepsRaw === undefined) {
    fail('meta.progressiveSteps must be an array')
  }
  if (!Array.isArray(stepsRaw)) {
    fail('meta.progressiveSteps must be an array')
  }
  if (stepsRaw.length > 0) {
    const stepIdSeen = new Set<string>()
    const covered = new Set<string>()
    const concatenated: string[] = []
    for (const step of stepsRaw) {
      if (
        !isPlainObject(step) ||
        !hasExactOwnKeys(step, ['stepId', 'labelEn', 'labelGu', 'fieldIds'])
      ) {
        fail('progressiveSteps entries must have exact keys stepId, labelEn, labelGu, fieldIds')
      }
      const stepId = readOwnDataProperty(step, 'stepId')
      const labelEn = readOwnDataProperty(step, 'labelEn')
      const labelGu = readOwnDataProperty(step, 'labelGu')
      const fieldIdsRaw = readOwnDataProperty(step, 'fieldIds')
      if (!isCleanNonBlank(stepId)) {
        fail('progressiveSteps entries must have a nonblank stepId')
      }
      if (stepIdSeen.has(stepId)) {
        fail(`Duplicate progressive step id`)
      }
      stepIdSeen.add(stepId)
      if (!isCleanNonBlank(labelEn) || !isCleanNonBlank(labelGu)) {
        fail(`progressiveSteps entries must have nonblank EN/GU labels`)
      }
      if (!Array.isArray(fieldIdsRaw)) {
        fail(`progressiveSteps fieldIds must be an array`)
      }
      if (fieldIdsRaw.length === 0) {
        fail(`progressiveSteps must contain at least one field`)
      }
      for (const fieldId of fieldIdsRaw) {
        if (!isCleanNonBlank(fieldId)) {
          fail('progressiveSteps fieldIds must be nonblank and unpadded')
        }
        if (!propertyKeySet.has(fieldId)) {
          fail(`progressiveSteps references unknown field`)
        }
        if (covered.has(fieldId)) {
          fail(`Field appears in multiple progressive steps`)
        }
        covered.add(fieldId)
        concatenated.push(fieldId)
      }
    }
    for (const key of propertyKeys) {
      if (!covered.has(key)) {
        fail(`Field missing from progressiveSteps coverage`)
      }
    }
    // Contiguous-boundary rule (FB-D4): concatenating step fieldIds must exactly
    // equal canonical ui:order (order and membership).
    const uiOrderRaw = definition.uiSchema['ui:order']
    if (!Array.isArray(uiOrderRaw)) {
      fail('uiSchema.ui:order must be an array')
    }
    const uiOrder = uiOrderRaw.filter((item): item is string => typeof item === 'string')
    if (
      concatenated.length !== uiOrder.length ||
      concatenated.some((fieldId, index) => fieldId !== uiOrder[index])
    ) {
      throw new AuthoringError(
        'inconsistent_step_boundaries',
        'progressiveSteps fieldIds must concatenate exactly to ui:order',
      )
    }
  }
}

/**
 * Verify that a FormDefinition is internally consistent across every
 * governed location. Detection only — never repairs or mutates input.
 *
 * Always throws {@link AuthoringError} with code `inconsistent_definition`
 * on failure. Unexpected TypeError / hostile inspection failures are
 * contained as typed AuthoringError and never leak (FB-D1.2).
 */
export function assertDefinitionIntegrity(definition: FormDefinition): void {
  try {
    assertDefinitionIntegrityInner(definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      throw error
    }
    throw new AuthoringError('inconsistent_definition', 'Definition structure is inconsistent')
  }
}

export function readUiOrder(definition: FormDefinition): readonly string[] {
  try {
    const raw = definition.uiSchema['ui:order']
    if (!Array.isArray(raw)) {
      fail('uiSchema.ui:order must be an array')
    }
    return raw.filter((item): item is string => typeof item === 'string')
  } catch (error) {
    if (error instanceof AuthoringError) {
      throw error
    }
    throw new AuthoringError('inconsistent_definition', 'Definition structure is inconsistent')
  }
}

export function findStepIndexForField(steps: readonly ProgressiveStep[], fieldId: string): number {
  return steps.findIndex((step) => step.fieldIds.includes(fieldId))
}

/** Sort a step's fieldIds to match relative order in ui:order. */
export function syncStepFieldIdsToUiOrder(
  fieldIds: readonly string[],
  uiOrder: readonly string[],
): readonly string[] {
  const set = new Set(fieldIds)
  return uiOrder.filter((id) => set.has(id))
}

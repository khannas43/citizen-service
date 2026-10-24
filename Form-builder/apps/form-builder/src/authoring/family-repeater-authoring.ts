/**
 * Pure family-repeater member authoring operations and drafts (FB-D16).
 * Never mutates inputs. Stale baselines yield `stale_editor_draft`.
 */

import type { FormDefinition, JsonObject } from '@dg20/form-contract'
import { FAMILY_REPEATER_GLOBAL_MAX_ROWS, getPaletteWidget } from '@dg20/form-widgets'

import { parseOptionalNonnegativeSafeIntegerString } from './age-integer.js'
import { cloneJsonSafeObject } from './clone.js'
import { isFamilyMemberWidgetType, type FamilyMemberWidgetType } from './family-member-types.js'
import {
  allocateMemberPropertyId,
  familyMemberDefinitionPath,
  isRepeaterDescendantPath,
} from './family-repeater-paths.js'
import {
  admitFamilyRepeaterSchema,
  assertFamilyRepeaterFieldGoverned,
  isFamilyRepeaterWidgetType,
  resolveFamilyRepeaterChildAdmissionMode,
} from './family-repeater-schema-admission.js'
import { assertDefinitionIntegrity } from './integrity.js'
import {
  type ConfigurationIssue,
  type FieldConfiguration,
  type FieldConfigurationDraft,
  isEditableWidgetType,
} from './property-config-types.js'
import {
  asSchemaObject,
  configurationToDraft,
  isConfigurationDirty,
} from './read-field-configuration.js'
import { getAuthoringTemplate } from './templates.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'
import { applySchemaConstraints } from './update-field-configuration.js'
import { validateFieldConfigurationDraft } from './validate-field-configuration.js'
import { readAgeExtension, readVerifyEmail } from './x-dg20-authoring.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function omitKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [k, v] of Object.entries(record)) {
    if (k !== key) {
      next[k] = v
    }
  }
  return next
}

function omitKeysMatching(
  record: Readonly<Record<string, { en: string; gu: string }>>,
  predicate: (key: string) => boolean,
): Record<string, { en: string; gu: string }> {
  const next: Record<string, { en: string; gu: string }> = {}
  for (const [k, v] of Object.entries(record)) {
    if (!predicate(k)) {
      next[k] = v
    }
  }
  return next
}

function applyOptionalPair(
  bucket: Readonly<Record<string, { en: string; gu: string }>>,
  fieldId: string,
  en: string,
  gu: string,
): Record<string, { en: string; gu: string }> {
  const next: Record<string, { en: string; gu: string }> = { ...bucket }
  if (en.length === 0 && gu.length === 0) {
    delete next[fieldId]
  } else {
    next[fieldId] = { en, gu }
  }
  return next
}

function schemaString(schema: Record<string, unknown>, key: string): string {
  const value = schema[key]
  return typeof value === 'string' ? value : ''
}

function schemaNumberAsString(schema: Record<string, unknown>, key: string): string {
  const value = schema[key]
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function readLocalizedPair(
  bucket: Readonly<Record<string, { en: string; gu: string }>>,
  path: string,
): { en: string; gu: string } | undefined {
  const pair = bucket[path]
  if (!pair) {
    return undefined
  }
  return { en: pair.en, gu: pair.gu }
}

function provenanceWidgetType(definition: FormDefinition, fieldId: string): string | undefined {
  return definition.meta.paletteProvenance.find((entry) => entry.fieldId === fieldId)?.widgetType
}

function getRepeaterSchemaParts(
  definition: FormDefinition,
  fieldId: string,
): {
  readonly rootSchema: Record<string, unknown>
  readonly items: Record<string, unknown>
  readonly properties: Record<string, unknown>
  readonly propertyKeys: readonly string[]
  readonly requiredMembers: readonly string[]
  readonly minItems: number
  readonly maxItems: number
} {
  const propertiesRoot = definition.jsonSchema['properties']
  if (!isPlainObject(propertiesRoot) || !(fieldId in propertiesRoot)) {
    throw new AuthoringError('field_not_found', `Field not found: ${fieldId}`)
  }
  const rootSchema = propertiesRoot[fieldId]
  if (!isPlainObject(rootSchema)) {
    throw new AuthoringError('inconsistent_definition', 'Family repeater schema must be an object')
  }
  const admitted = admitFamilyRepeaterSchema(rootSchema)
  if (!admitted.ok) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater field schema does not match governed invariants',
    )
  }
  const items = rootSchema['items']
  if (!isPlainObject(items)) {
    throw new AuthoringError('inconsistent_definition', 'Family repeater items must be an object')
  }
  const properties = items['properties']
  if (!isPlainObject(properties)) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Family repeater items.properties must be an object',
    )
  }
  return {
    rootSchema,
    items,
    properties,
    propertyKeys: admitted.propertyKeys,
    requiredMembers: admitted.requiredMembers,
    minItems: admitted.minItems,
    maxItems: admitted.maxItems,
  }
}

/**
 * Structural baseline snapshot for stale detection (committed repeater shape).
 */
export type FamilyRepeaterStructureBaseline = {
  readonly structureKey: string
}

function familyRepeaterMemberStructurePayload(
  definition: FormDefinition,
  fieldId: string,
): {
  readonly minItems: number
  readonly maxItems: number
  readonly propertyKeys: readonly string[]
  readonly required: readonly string[]
  readonly schemas: readonly string[]
  readonly uiItems: readonly string[]
  readonly nestedProvenance: readonly string[]
} {
  const parts = getRepeaterSchemaParts(definition, fieldId)
  const uiEntry = definition.uiSchema[fieldId]
  const uiItems =
    isPlainObject(uiEntry) && isPlainObject(uiEntry['items'])
      ? (uiEntry['items'] as Record<string, unknown>)
      : {}
  const nestedProvenance = definition.meta.paletteProvenance
    .filter((entry) => isRepeaterDescendantPath(entry.fieldId, fieldId))
    .map((entry) => `${entry.fieldId}:${entry.widgetType}`)
    .sort()
  return {
    minItems: parts.minItems,
    maxItems: parts.maxItems,
    propertyKeys: parts.propertyKeys,
    required: parts.requiredMembers,
    schemas: parts.propertyKeys.map((key) => JSON.stringify(parts.properties[key] ?? null)),
    uiItems: parts.propertyKeys.map((key) => JSON.stringify(uiItems[key] ?? null)),
    nestedProvenance,
  }
}

export function serializeFamilyRepeaterStructureBaseline(
  definition: FormDefinition,
  fieldId: string,
): FamilyRepeaterStructureBaseline {
  const memberPayload = familyRepeaterMemberStructurePayload(definition, fieldId)
  const labels = Object.keys(definition.meta.bilingual.labels)
    .filter((key) => key === fieldId || isRepeaterDescendantPath(key, fieldId))
    .sort()
    .map((key) => {
      const pair = definition.meta.bilingual.labels[key]!
      return `${key}=${pair.en}|${pair.gu}`
    })
  const help = Object.keys(definition.meta.bilingual.help)
    .filter((key) => key === fieldId || isRepeaterDescendantPath(key, fieldId))
    .sort()
    .map((key) => {
      const pair = definition.meta.bilingual.help[key]!
      return `${key}=${pair.en}|${pair.gu}`
    })
  return {
    structureKey: JSON.stringify({
      ...memberPayload,
      labels,
      help,
    }),
  }
}

/**
 * Member/bounds structure key for preview remount — excludes bilingual labels/help
 * so label-only Apply does not unnecessarily reset preview rows (FB-D16).
 */
export function serializeFamilyRepeaterMemberStructureKey(
  definition: FormDefinition,
  fieldId: string,
): string {
  return JSON.stringify(familyRepeaterMemberStructurePayload(definition, fieldId))
}

function assertBaselineFresh(
  definition: FormDefinition,
  fieldId: string,
  expectedBaseline: FamilyRepeaterStructureBaseline,
): void {
  const live = serializeFamilyRepeaterStructureBaseline(definition, fieldId)
  if (live.structureKey !== expectedBaseline.structureKey) {
    throw new AuthoringError(
      'stale_editor_draft',
      'Family repeater structure changed since editing began',
    )
  }
}

export type FamilyMemberCapabilities = {
  readonly canAddMember: boolean
  readonly canRemoveMember: boolean
  readonly canMoveEarlier: boolean
  readonly canMoveLater: boolean
  /** False when loaded with unsupported child widgets — member structure read-only. */
  readonly membersEditable: boolean
  readonly memberCount: number
  readonly memberPropertyNames: readonly string[]
}

export function getFamilyMemberCapabilities(
  definition: FormDefinition,
  fieldId: string,
): FamilyMemberCapabilities {
  const empty: FamilyMemberCapabilities = {
    canAddMember: false,
    canRemoveMember: false,
    canMoveEarlier: false,
    canMoveLater: false,
    membersEditable: false,
    memberCount: 0,
    memberPropertyNames: [],
  }
  try {
    assertDefinitionIntegrity(definition)
    if (provenanceWidgetType(definition, fieldId) !== 'family-repeater') {
      return empty
    }
    assertFamilyRepeaterFieldGoverned(definition, fieldId)
    const parts = getRepeaterSchemaParts(definition, fieldId)
    const childTypes = parts.propertyKeys.map((name) => {
      const path = familyMemberDefinitionPath(fieldId, name)
      return provenanceWidgetType(definition, path) ?? ''
    })
    const membersEditable =
      resolveFamilyRepeaterChildAdmissionMode(childTypes) === 'builder-authored'
    const memberCount = parts.propertyKeys.length
    return {
      canAddMember: membersEditable,
      canRemoveMember: membersEditable && memberCount > 1,
      canMoveEarlier: membersEditable && memberCount > 1,
      canMoveLater: membersEditable && memberCount > 1,
      membersEditable,
      memberCount,
      memberPropertyNames: parts.propertyKeys,
    }
  } catch {
    return empty
  }
}

export function readFamilyMemberConfiguration(
  definition: FormDefinition,
  repeaterFieldId: string,
  propertyName: string,
): FieldConfiguration {
  return readMemberConfiguration(definition, repeaterFieldId, propertyName)
}

function readMemberConfiguration(
  definition: FormDefinition,
  repeaterFieldId: string,
  propertyName: string,
): FieldConfiguration {
  const parts = getRepeaterSchemaParts(definition, repeaterFieldId)
  const nestedPath = familyMemberDefinitionPath(repeaterFieldId, propertyName)
  const widgetType = provenanceWidgetType(definition, nestedPath)
  if (widgetType === undefined || !isFamilyMemberWidgetType(widgetType)) {
    throw new AuthoringError(
      'unsupported_property_editor',
      'Member widget type is not editable in the family repeater editor',
    )
  }
  if (!isEditableWidgetType(widgetType)) {
    throw new AuthoringError(
      'unsupported_property_editor',
      'Member widget type is not editable in the family repeater editor',
    )
  }
  const schemaRaw = parts.properties[propertyName]
  if (!isPlainObject(schemaRaw)) {
    throw new AuthoringError('inconsistent_definition', 'Member schema must be an object')
  }
  const schema = schemaRaw as Record<string, unknown>
  const labels = readLocalizedPair(definition.meta.bilingual.labels, nestedPath)
  if (labels === undefined) {
    throw new AuthoringError('inconsistent_definition', 'Member is missing bilingual labels')
  }
  const helpPair = readLocalizedPair(definition.meta.bilingual.help, nestedPath)
  const helpEn = helpPair?.en ?? ''
  const helpGu = helpPair?.gu ?? ''
  const required = parts.requiredMembers.includes(propertyName)
  const common = {
    labelEn: labels.en,
    labelGu: labels.gu,
    helpEn,
    helpGu,
    required,
  }

  switch (widgetType) {
    case 'text-short':
      return {
        widgetType: 'text-short',
        ...common,
        maxLength:
          typeof schema['maxLength'] === 'number' && Number.isSafeInteger(schema['maxLength'])
            ? String(schema['maxLength'])
            : '120',
        pattern: schemaString(schema, 'pattern'),
      }
    case 'text-long':
      return {
        widgetType: 'text-long',
        ...common,
        maxLength:
          typeof schema['maxLength'] === 'number' && Number.isSafeInteger(schema['maxLength'])
            ? String(schema['maxLength'])
            : '1000',
      }
    case 'number':
      return {
        widgetType: 'number',
        ...common,
        minimum: schemaNumberAsString(schema, 'minimum'),
        maximum: schemaNumberAsString(schema, 'maximum'),
        step: schemaNumberAsString(schema, 'multipleOf'),
      }
    case 'currency-inr':
      return {
        widgetType: 'currency-inr',
        ...common,
        minimum:
          typeof schema['minimum'] === 'number' &&
          Number.isFinite(schema['minimum']) &&
          schema['minimum'] !== 0
            ? String(schema['minimum'])
            : '',
        maximum: schemaNumberAsString(schema, 'maximum'),
      }
    case 'percentage':
      return { widgetType: 'percentage', ...common }
    case 'gender':
      return { widgetType: 'gender', ...common }
    case 'yesno':
      return { widgetType: 'yesno', ...common }
    case 'email':
      return {
        widgetType: 'email',
        ...common,
        verifyEmail: readVerifyEmail(schema),
      }
    case 'dob':
      return {
        widgetType: 'dob',
        ...common,
        minAge: readAgeExtension(schema, 'minAge'),
        maxAge: readAgeExtension(schema, 'maxAge'),
      }
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      throw new AuthoringError(
        'unsupported_property_editor',
        'Member widget type is not editable in the family repeater editor',
      )
    }
  }
}

export type FamilyMemberDraft = {
  readonly propertyName: string
  readonly configuration: FieldConfigurationDraft
}

export type FamilyRepeaterDraftContent = {
  readonly labelEn: string
  readonly labelGu: string
  readonly helpEn: string
  readonly helpGu: string
  readonly minItems: string
  readonly maxItems: string
  readonly members: readonly FamilyMemberDraft[]
}

export function seedFamilyRepeaterDraftContent(
  definition: FormDefinition,
  fieldId: string,
): FamilyRepeaterDraftContent {
  if (provenanceWidgetType(definition, fieldId) !== 'family-repeater') {
    throw new AuthoringError('field_not_found', `Field is not a family-repeater: ${fieldId}`)
  }
  const parts = getRepeaterSchemaParts(definition, fieldId)
  const rootLabels = readLocalizedPair(definition.meta.bilingual.labels, fieldId)
  if (rootLabels === undefined) {
    throw new AuthoringError('inconsistent_definition', 'Field is missing bilingual labels')
  }
  const rootHelp = readLocalizedPair(definition.meta.bilingual.help, fieldId)
  const members: FamilyMemberDraft[] = parts.propertyKeys.map((propertyName) => ({
    propertyName,
    configuration: configurationToDraft(readMemberConfiguration(definition, fieldId, propertyName)),
  }))
  return {
    labelEn: rootLabels.en,
    labelGu: rootLabels.gu,
    helpEn: rootHelp?.en ?? '',
    helpGu: rootHelp?.gu ?? '',
    minItems: String(parts.minItems),
    maxItems: String(parts.maxItems),
    members,
  }
}

/** Prefer empty minItems draft when committed minItems is the implicit default 0 and schema omits minItems. */
export function readFamilyRepeaterDraftContent(
  definition: FormDefinition,
  fieldId: string,
): FamilyRepeaterDraftContent {
  const parts = getRepeaterSchemaParts(definition, fieldId)
  const rootSchema = parts.rootSchema
  const minDraft = Object.prototype.hasOwnProperty.call(rootSchema, 'minItems')
    ? String(parts.minItems)
    : ''
  const seeded = seedFamilyRepeaterDraftContent(definition, fieldId)
  return { ...seeded, minItems: minDraft }
}

export function isFamilyRepeaterDraftDirty(
  draft: FamilyRepeaterDraftContent,
  baseline: FamilyRepeaterDraftContent,
): boolean {
  if (
    draft.labelEn !== baseline.labelEn ||
    draft.labelGu !== baseline.labelGu ||
    draft.helpEn !== baseline.helpEn ||
    draft.helpGu !== baseline.helpGu ||
    draft.minItems !== baseline.minItems ||
    draft.maxItems !== baseline.maxItems ||
    draft.members.length !== baseline.members.length
  ) {
    return true
  }
  for (let i = 0; i < draft.members.length; i += 1) {
    const d = draft.members[i]!
    const b = baseline.members[i]!
    if (d.propertyName !== b.propertyName) {
      return true
    }
    if (isConfigurationDirty(d.configuration, b.configuration)) {
      return true
    }
  }
  return false
}

export type FamilyRepeaterDraftValidationResult =
  | { readonly ok: true; readonly content: FamilyRepeaterDraftContent }
  | {
      readonly ok: false
      readonly issues: readonly ConfigurationIssue[]
      readonly firstInvalidControl: string
    }

function isCleanNonBlank(value: string): boolean {
  return value.length > 0 && value === value.trim()
}

export function validateFamilyRepeaterDraftContent(
  draft: FamilyRepeaterDraftContent,
  options?: { readonly previewRowCount?: number },
): FamilyRepeaterDraftValidationResult {
  const issues: ConfigurationIssue[] = []
  if (!isCleanNonBlank(draft.labelEn)) {
    issues.push({
      code: draft.labelEn !== draft.labelEn.trim() ? 'label_en_padded' : 'label_en_required',
      control: 'labelEn',
    })
  }
  if (!isCleanNonBlank(draft.labelGu)) {
    issues.push({
      code: draft.labelGu !== draft.labelGu.trim() ? 'label_gu_padded' : 'label_gu_required',
      control: 'labelGu',
    })
  }
  if (
    (draft.helpEn.length === 0) !== (draft.helpGu.length === 0) ||
    (draft.helpEn.length > 0 && draft.helpEn !== draft.helpEn.trim()) ||
    (draft.helpGu.length > 0 && draft.helpGu !== draft.helpGu.trim())
  ) {
    if ((draft.helpEn.length === 0) !== (draft.helpGu.length === 0)) {
      issues.push({ code: 'help_pair_incomplete', control: 'helpEn' })
    } else if (draft.helpEn !== draft.helpEn.trim()) {
      issues.push({ code: 'help_en_padded', control: 'helpEn' })
    } else {
      issues.push({ code: 'help_gu_padded', control: 'helpGu' })
    }
  }

  const maxParsed = parseOptionalNonnegativeSafeIntegerString(draft.maxItems)
  if (
    !maxParsed.ok ||
    maxParsed.value === undefined ||
    maxParsed.value < 1 ||
    maxParsed.value > FAMILY_REPEATER_GLOBAL_MAX_ROWS
  ) {
    issues.push({ code: 'max_items_invalid', control: 'maxItems' })
  }
  const minParsed = parseOptionalNonnegativeSafeIntegerString(draft.minItems)
  if (!minParsed.ok) {
    issues.push({ code: 'min_items_invalid', control: 'minItems' })
  } else if (
    minParsed.value !== undefined &&
    maxParsed.ok &&
    maxParsed.value !== undefined &&
    minParsed.value > maxParsed.value
  ) {
    issues.push({ code: 'items_range_invalid', control: 'maxItems' })
  }

  if (
    maxParsed.ok &&
    maxParsed.value !== undefined &&
    options?.previewRowCount !== undefined &&
    options.previewRowCount > maxParsed.value
  ) {
    issues.push({ code: 'max_items_invalid', control: 'maxItems' })
  }

  if (draft.members.length === 0) {
    issues.push({ code: 'label_en_required', control: 'members' })
  }

  for (const member of draft.members) {
    if (!isFamilyMemberWidgetType(member.configuration.widgetType)) {
      issues.push({ code: 'label_en_required', control: `member:${member.propertyName}` })
      continue
    }
    const palette = getPaletteWidget(member.configuration.widgetType)
    if (palette && !palette.supportsRequired && 'required' in member.configuration) {
      // required toggle only when supportsRequired; still validate draft via shared validator
    }
    const validated = validateFieldConfigurationDraft(member.configuration)
    if (!validated.ok) {
      for (const issue of validated.issues) {
        issues.push({
          ...issue,
          control: `member:${member.propertyName}:${issue.control}`,
        })
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues, firstInvalidControl: issues[0]!.control }
  }
  return { ok: true, content: draft }
}

function scrubNestedMetaForPath(
  definition: FormDefinition,
  nestedPath: string,
): FormDefinition['meta'] {
  return {
    ...definition.meta,
    paletteProvenance: definition.meta.paletteProvenance.filter(
      (entry) => entry.fieldId !== nestedPath,
    ),
    bilingual: {
      labels: omitKey(definition.meta.bilingual.labels, nestedPath),
      help: omitKey(definition.meta.bilingual.help, nestedPath),
      errors: omitKey(definition.meta.bilingual.errors, nestedPath),
    },
    prefillBindings: definition.meta.prefillBindings.filter((b) => b.fieldId !== nestedPath),
    integrationBindings: definition.meta.integrationBindings.filter(
      (b) => b.fieldId !== nestedPath,
    ),
    workflowBindings: definition.meta.workflowBindings.filter((b) => b.fieldId !== nestedPath),
  }
}

function scrubPropertyFromPreviewRows(
  previewFormData: Readonly<Record<string, unknown>>,
  repeaterFieldId: string,
  memberPropertyName: string,
): Record<string, unknown> {
  const existing = previewFormData[repeaterFieldId]
  if (!Array.isArray(existing)) {
    return { ...previewFormData }
  }
  const nextRows = existing.map((row) => {
    if (!isPlainObject(row)) {
      return row
    }
    return omitKey(row as Record<string, unknown>, memberPropertyName)
  })
  return { ...previewFormData, [repeaterFieldId]: nextRows }
}

function rebuildItemsRequired(
  propertyKeys: readonly string[],
  requiredNames: ReadonlySet<string>,
): string[] | undefined {
  const next = propertyKeys.filter((key) => requiredNames.has(key))
  return next.length > 0 ? next : undefined
}

export function addFamilyMember(
  state: BuilderAuthoringState,
  repeaterFieldId: string,
  input: {
    readonly widgetType: FamilyMemberWidgetType
    readonly labelEn: string
    readonly labelGu: string
    readonly required: boolean
  },
  expectedBaseline: FamilyRepeaterStructureBaseline,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
    if (provenanceWidgetType(state.definition, repeaterFieldId) !== 'family-repeater') {
      return {
        ok: false,
        error: new AuthoringError('field_not_found', `Field not found: ${repeaterFieldId}`),
      }
    }
    assertFamilyRepeaterFieldGoverned(state.definition, repeaterFieldId)
    assertBaselineFresh(state.definition, repeaterFieldId, expectedBaseline)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const capabilities = getFamilyMemberCapabilities(state.definition, repeaterFieldId)
  if (!capabilities.membersEditable || !capabilities.canAddMember) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Cannot add a member to this family repeater',
      ),
    }
  }
  if (!isCleanNonBlank(input.labelEn) || !isCleanNonBlank(input.labelGu)) {
    return {
      ok: false,
      error: new AuthoringError('configuration_invalid', 'Member labels must be nonblank'),
    }
  }
  const palette = getPaletteWidget(input.widgetType)
  if (!palette?.supportsRequired && input.required) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Member widget type does not support required',
      ),
    }
  }

  const template = getAuthoringTemplate(input.widgetType)
  if (!template || template.addMode !== 'immediate') {
    return {
      ok: false,
      error: new AuthoringError('configuration_invalid', 'Member widget template is not available'),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const parts = getRepeaterSchemaParts(nextDefinition, repeaterFieldId)
  const memberId = allocateMemberPropertyId(new Set(parts.propertyKeys), input.widgetType)
  const nestedPath = familyMemberDefinitionPath(repeaterFieldId, memberId)
  const childSchema = template.buildSchema() as JsonObject

  const nextProperties = { ...parts.properties, [memberId]: childSchema }
  const nextPropertyKeys = [...parts.propertyKeys, memberId]
  const requiredSet = new Set(parts.requiredMembers)
  if (input.required) {
    requiredSet.add(memberId)
  }
  const nextRequired = rebuildItemsRequired(nextPropertyKeys, requiredSet)

  const nextItems: Record<string, unknown> = {
    ...parts.items,
    properties: nextProperties,
  }
  if (nextRequired === undefined) {
    delete nextItems['required']
  } else {
    nextItems['required'] = nextRequired
  }

  const nextRootSchema: Record<string, unknown> = {
    ...parts.rootSchema,
    items: nextItems,
  }

  const rootProperties = {
    ...(nextDefinition.jsonSchema.properties as Record<string, JsonObject>),
    [repeaterFieldId]: nextRootSchema as JsonObject,
  }

  const uiEntry = nextDefinition.uiSchema[repeaterFieldId]
  const uiItems =
    isPlainObject(uiEntry) && isPlainObject(uiEntry['items'])
      ? { ...(uiEntry['items'] as Record<string, unknown>) }
      : {}
  uiItems[memberId] = template.buildUiSchemaEntry()

  const definition: FormDefinition = {
    ...nextDefinition,
    jsonSchema: {
      ...nextDefinition.jsonSchema,
      properties: rootProperties,
    },
    uiSchema: {
      ...nextDefinition.uiSchema,
      [repeaterFieldId]: {
        ...(isPlainObject(uiEntry) ? uiEntry : {}),
        'ui:field': 'family-repeater',
        items: uiItems,
      },
    } as FormDefinition['uiSchema'],
    meta: {
      ...nextDefinition.meta,
      paletteProvenance: [
        ...nextDefinition.meta.paletteProvenance,
        { fieldId: nestedPath, widgetType: input.widgetType },
      ],
      bilingual: {
        ...nextDefinition.meta.bilingual,
        labels: {
          ...nextDefinition.meta.bilingual.labels,
          [nestedPath]: { en: input.labelEn, gu: input.labelGu },
        },
      },
    },
  }

  try {
    assertDefinitionIntegrity(definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: state.selectedFieldId,
      previewFormData: state.previewFormData,
    },
    announcementKey: 'announceChangesApplied',
  }
}

export function removeFamilyMember(
  state: BuilderAuthoringState,
  repeaterFieldId: string,
  memberPropertyName: string,
  expectedBaseline: FamilyRepeaterStructureBaseline,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
    if (provenanceWidgetType(state.definition, repeaterFieldId) !== 'family-repeater') {
      return {
        ok: false,
        error: new AuthoringError('field_not_found', `Field not found: ${repeaterFieldId}`),
      }
    }
    assertFamilyRepeaterFieldGoverned(state.definition, repeaterFieldId)
    assertBaselineFresh(state.definition, repeaterFieldId, expectedBaseline)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const capabilities = getFamilyMemberCapabilities(state.definition, repeaterFieldId)
  if (!capabilities.canRemoveMember) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Cannot remove the last family repeater member',
      ),
    }
  }
  if (!capabilities.memberPropertyNames.includes(memberPropertyName)) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Member not found: ${memberPropertyName}`),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const parts = getRepeaterSchemaParts(nextDefinition, repeaterFieldId)
  const nestedPath = familyMemberDefinitionPath(repeaterFieldId, memberPropertyName)

  const nextProperties = omitKey(parts.properties as Record<string, unknown>, memberPropertyName)
  const nextPropertyKeys = parts.propertyKeys.filter((key) => key !== memberPropertyName)
  const requiredSet = new Set(parts.requiredMembers)
  requiredSet.delete(memberPropertyName)
  const nextRequired = rebuildItemsRequired(nextPropertyKeys, requiredSet)

  const nextItems: Record<string, unknown> = {
    ...parts.items,
    properties: nextProperties,
  }
  if (nextRequired === undefined) {
    delete nextItems['required']
  } else {
    nextItems['required'] = nextRequired
  }

  const nextRootSchema: Record<string, unknown> = {
    ...parts.rootSchema,
    items: nextItems,
  }

  const uiEntry = nextDefinition.uiSchema[repeaterFieldId]
  const uiItems =
    isPlainObject(uiEntry) && isPlainObject(uiEntry['items'])
      ? omitKey(uiEntry['items'] as Record<string, unknown>, memberPropertyName)
      : {}

  const definition: FormDefinition = {
    ...nextDefinition,
    jsonSchema: {
      ...nextDefinition.jsonSchema,
      properties: {
        ...(nextDefinition.jsonSchema.properties as Record<string, JsonObject>),
        [repeaterFieldId]: nextRootSchema as JsonObject,
      },
    },
    uiSchema: {
      ...nextDefinition.uiSchema,
      [repeaterFieldId]: {
        ...(isPlainObject(uiEntry) ? uiEntry : {}),
        'ui:field': 'family-repeater',
        items: uiItems,
      },
    } as FormDefinition['uiSchema'],
    meta: scrubNestedMetaForPath(nextDefinition, nestedPath),
  }

  try {
    assertDefinitionIntegrity(definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: state.selectedFieldId,
      previewFormData: scrubPropertyFromPreviewRows(
        state.previewFormData,
        repeaterFieldId,
        memberPropertyName,
      ),
    },
    announcementKey: 'announceChangesApplied',
  }
}

export function moveFamilyMember(
  state: BuilderAuthoringState,
  repeaterFieldId: string,
  memberPropertyName: string,
  direction: 'earlier' | 'later',
  expectedBaseline: FamilyRepeaterStructureBaseline,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
    if (provenanceWidgetType(state.definition, repeaterFieldId) !== 'family-repeater') {
      return {
        ok: false,
        error: new AuthoringError('field_not_found', `Field not found: ${repeaterFieldId}`),
      }
    }
    assertFamilyRepeaterFieldGoverned(state.definition, repeaterFieldId)
    assertBaselineFresh(state.definition, repeaterFieldId, expectedBaseline)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const parts = getRepeaterSchemaParts(state.definition, repeaterFieldId)
  const index = parts.propertyKeys.indexOf(memberPropertyName)
  if (index < 0) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Member not found: ${memberPropertyName}`),
    }
  }
  const targetIndex = direction === 'earlier' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= parts.propertyKeys.length) {
    return {
      ok: false,
      error: new AuthoringError('configuration_invalid', 'Cannot move member further'),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const liveParts = getRepeaterSchemaParts(nextDefinition, repeaterFieldId)
  const orderedKeys = [...liveParts.propertyKeys]
  const swapWith = orderedKeys[targetIndex]!
  orderedKeys[index] = swapWith
  orderedKeys[targetIndex] = memberPropertyName

  const nextProperties: Record<string, unknown> = {}
  for (const key of orderedKeys) {
    nextProperties[key] = liveParts.properties[key]
  }

  const requiredSet = new Set(liveParts.requiredMembers)
  const nextRequired = rebuildItemsRequired(orderedKeys, requiredSet)
  const nextItems: Record<string, unknown> = {
    ...liveParts.items,
    properties: nextProperties,
  }
  if (nextRequired === undefined) {
    delete nextItems['required']
  } else {
    nextItems['required'] = nextRequired
  }

  const uiEntry = nextDefinition.uiSchema[repeaterFieldId]
  const prevUiItems =
    isPlainObject(uiEntry) && isPlainObject(uiEntry['items'])
      ? (uiEntry['items'] as Record<string, unknown>)
      : {}
  const nextUiItems: Record<string, unknown> = {}
  for (const key of orderedKeys) {
    nextUiItems[key] = prevUiItems[key]
  }

  const definition: FormDefinition = {
    ...nextDefinition,
    jsonSchema: {
      ...nextDefinition.jsonSchema,
      properties: {
        ...(nextDefinition.jsonSchema.properties as Record<string, JsonObject>),
        [repeaterFieldId]: {
          ...liveParts.rootSchema,
          items: nextItems,
        } as JsonObject,
      },
    },
    uiSchema: {
      ...nextDefinition.uiSchema,
      [repeaterFieldId]: {
        ...(isPlainObject(uiEntry) ? uiEntry : {}),
        'ui:field': 'family-repeater',
        items: nextUiItems,
      },
    } as FormDefinition['uiSchema'],
  }

  try {
    assertDefinitionIntegrity(definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: state.selectedFieldId,
      previewFormData: state.previewFormData,
    },
    announcementKey: 'announceChangesApplied',
  }
}

export type FamilyRepeaterAcceptedConfiguration = {
  readonly labelEn: string
  readonly labelGu: string
  readonly helpEn: string
  readonly helpGu: string
  readonly minItems: number | undefined
  readonly maxItems: number
  readonly members: readonly {
    readonly propertyName: string
    readonly configuration: FieldConfiguration
  }[]
}

/**
 * Atomically apply labels/help + min/max + full member structure.
 * Blocks when lowering maxItems below existing preview row count.
 */
export function updateFamilyRepeaterConfiguration(
  state: BuilderAuthoringState,
  fieldId: string,
  configuration: FamilyRepeaterAcceptedConfiguration,
  expectedBaseline: FamilyRepeaterStructureBaseline,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
    if (provenanceWidgetType(state.definition, fieldId) !== 'family-repeater') {
      return {
        ok: false,
        error: new AuthoringError('field_not_found', `Field not found: ${fieldId}`),
      }
    }
    assertFamilyRepeaterFieldGoverned(state.definition, fieldId)
    assertBaselineFresh(state.definition, fieldId, expectedBaseline)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  if (configuration.members.length === 0) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Family repeater requires at least one member',
      ),
    }
  }
  if (
    configuration.maxItems < 1 ||
    configuration.maxItems > FAMILY_REPEATER_GLOBAL_MAX_ROWS ||
    (configuration.minItems !== undefined &&
      (configuration.minItems < 0 || configuration.minItems > configuration.maxItems))
  ) {
    return {
      ok: false,
      error: new AuthoringError('configuration_invalid', 'Family repeater bounds are invalid'),
    }
  }

  const previewRows = state.previewFormData[fieldId]
  const previewRowCount = Array.isArray(previewRows) ? previewRows.length : 0
  if (previewRowCount > configuration.maxItems) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Cannot lower maxItems below existing preview row count',
      ),
    }
  }

  for (const member of configuration.members) {
    if (!isFamilyMemberWidgetType(member.configuration.widgetType)) {
      return {
        ok: false,
        error: new AuthoringError(
          'configuration_invalid',
          'Family repeater member widget type is not supported',
        ),
      }
    }
    const validation = validateFieldConfigurationDraft(member.configuration)
    if (!validation.ok) {
      return {
        ok: false,
        error: new AuthoringError(
          'configuration_invalid',
          'Member configuration failed validation',
        ),
      }
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const parts = getRepeaterSchemaParts(nextDefinition, fieldId)

  const previousMemberNames = new Set(parts.propertyKeys)
  const nextMemberNames = new Set(configuration.members.map((m) => m.propertyName))
  const seenNames = new Set<string>()
  for (const member of configuration.members) {
    if (seenNames.has(member.propertyName)) {
      return {
        ok: false,
        error: new AuthoringError(
          'configuration_invalid',
          'Family repeater member property names must be unique',
        ),
      }
    }
    seenNames.add(member.propertyName)
  }

  const nextProperties: Record<string, unknown> = {}
  const nextUiItems: Record<string, unknown> = {}
  const requiredSet = new Set<string>()
  const nextProvenance = nextDefinition.meta.paletteProvenance.filter(
    (entry) => entry.fieldId === fieldId || !isRepeaterDescendantPath(entry.fieldId, fieldId),
  )
  let nextLabels = omitKeysMatching(nextDefinition.meta.bilingual.labels, (key) =>
    isRepeaterDescendantPath(key, fieldId),
  )
  let nextHelp = omitKeysMatching(nextDefinition.meta.bilingual.help, (key) =>
    isRepeaterDescendantPath(key, fieldId),
  )
  let nextErrors = omitKeysMatching(nextDefinition.meta.bilingual.errors, (key) =>
    isRepeaterDescendantPath(key, fieldId),
  )

  nextLabels = {
    ...nextLabels,
    [fieldId]: { en: configuration.labelEn, gu: configuration.labelGu },
  }
  nextHelp = applyOptionalPair(nextHelp, fieldId, configuration.helpEn, configuration.helpGu)

  for (const member of configuration.members) {
    const template = getAuthoringTemplate(member.configuration.widgetType)
    if (!template || template.addMode !== 'immediate') {
      return {
        ok: false,
        error: new AuthoringError(
          'configuration_invalid',
          'Family repeater member widget template is not available',
        ),
      }
    }
    const previousSchema = previousMemberNames.has(member.propertyName)
      ? asSchemaObject(parts.properties[member.propertyName])
      : (template.buildSchema() as JsonObject)
    const nextSchema = applySchemaConstraints(previousSchema, member.configuration)
    nextProperties[member.propertyName] = nextSchema
    nextUiItems[member.propertyName] = template.buildUiSchemaEntry()
    if (
      member.configuration.widgetType !== 'section-header' &&
      'required' in member.configuration
    ) {
      const required = (member.configuration as { required?: boolean }).required === true
      if (required) {
        requiredSet.add(member.propertyName)
      }
    }
    const nestedPath = familyMemberDefinitionPath(fieldId, member.propertyName)
    nextProvenance.push({
      fieldId: nestedPath,
      widgetType: member.configuration.widgetType,
    })
    nextLabels = {
      ...nextLabels,
      [nestedPath]: {
        en: member.configuration.labelEn,
        gu: member.configuration.labelGu,
      },
    }
    const helpEn = 'helpEn' in member.configuration ? (member.configuration.helpEn as string) : ''
    const helpGu = 'helpGu' in member.configuration ? (member.configuration.helpGu as string) : ''
    nextHelp = applyOptionalPair(nextHelp, nestedPath, helpEn, helpGu)
  }

  // Remove bindings for members dropped from the structure.
  const removedMembers = parts.propertyKeys.filter((name) => !nextMemberNames.has(name))
  let previewFormData = { ...state.previewFormData }
  for (const removed of removedMembers) {
    const nestedPath = familyMemberDefinitionPath(fieldId, removed)
    nextErrors = omitKey(nextErrors, nestedPath)
    previewFormData = scrubPropertyFromPreviewRows(previewFormData, fieldId, removed)
  }

  const nextRequired = rebuildItemsRequired(
    configuration.members.map((m) => m.propertyName),
    requiredSet,
  )
  const nextItems: Record<string, unknown> = {
    ...parts.items,
    type: 'object',
    properties: nextProperties,
    additionalProperties: false,
  }
  if (nextRequired !== undefined) {
    nextItems['required'] = nextRequired
  } else {
    delete nextItems['required']
  }

  const nextRootSchema: Record<string, unknown> = {
    ...parts.rootSchema,
    type: 'array',
    items: nextItems,
    maxItems: configuration.maxItems,
  }
  delete nextRootSchema['x-dg20']
  if (configuration.minItems !== undefined) {
    nextRootSchema.minItems = configuration.minItems
  } else {
    delete nextRootSchema.minItems
  }

  const uiEntry = nextDefinition.uiSchema[fieldId]
  const definition: FormDefinition = {
    ...nextDefinition,
    jsonSchema: {
      ...nextDefinition.jsonSchema,
      properties: {
        ...(nextDefinition.jsonSchema.properties as Record<string, JsonObject>),
        [fieldId]: nextRootSchema as JsonObject,
      },
    },
    uiSchema: {
      ...nextDefinition.uiSchema,
      [fieldId]: {
        ...(isPlainObject(uiEntry) ? uiEntry : {}),
        'ui:field': 'family-repeater',
        items: nextUiItems,
      },
    } as FormDefinition['uiSchema'],
    meta: {
      ...nextDefinition.meta,
      paletteProvenance: nextProvenance,
      bilingual: {
        labels: nextLabels,
        help: nextHelp,
        errors: nextErrors,
      },
      prefillBindings: nextDefinition.meta.prefillBindings.filter(
        (b) =>
          !(
            isRepeaterDescendantPath(b.fieldId, fieldId) &&
            removedMembers.some((name) => familyMemberDefinitionPath(fieldId, name) === b.fieldId)
          ),
      ),
      integrationBindings: nextDefinition.meta.integrationBindings.filter(
        (b) =>
          !(
            isRepeaterDescendantPath(b.fieldId, fieldId) &&
            removedMembers.some((name) => familyMemberDefinitionPath(fieldId, name) === b.fieldId)
          ),
      ),
      workflowBindings: nextDefinition.meta.workflowBindings.filter(
        (b) =>
          !(
            isRepeaterDescendantPath(b.fieldId, fieldId) &&
            removedMembers.some((name) => familyMemberDefinitionPath(fieldId, name) === b.fieldId)
          ),
      ),
    },
  }

  try {
    assertDefinitionIntegrity(definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: state.selectedFieldId,
      previewFormData,
    },
    announcementKey: 'announceChangesApplied',
  }
}

export function isFamilyRepeaterRoot(definition: FormDefinition, fieldId: string): boolean {
  return isFamilyRepeaterWidgetType(provenanceWidgetType(definition, fieldId) ?? '')
}

export function createDefaultFamilyMemberConfiguration(
  widgetType: FamilyMemberWidgetType,
  input: {
    readonly labelEn: string
    readonly labelGu: string
    readonly required: boolean
  },
): FieldConfigurationDraft {
  const palette = getPaletteWidget(widgetType)
  const required = palette?.supportsRequired === true ? input.required : false
  const common = {
    labelEn: input.labelEn,
    labelGu: input.labelGu,
    helpEn: '',
    helpGu: '',
    required,
  }
  switch (widgetType) {
    case 'text-short':
      return { widgetType: 'text-short', ...common, maxLength: '120', pattern: '' }
    case 'text-long':
      return { widgetType: 'text-long', ...common, maxLength: '1000' }
    case 'number':
      return { widgetType: 'number', ...common, minimum: '', maximum: '', step: '' }
    case 'currency-inr':
      return { widgetType: 'currency-inr', ...common, minimum: '', maximum: '' }
    case 'percentage':
      return { widgetType: 'percentage', ...common }
    case 'gender':
      return { widgetType: 'gender', ...common }
    case 'yesno':
      return { widgetType: 'yesno', ...common }
    case 'email':
      return { widgetType: 'email', ...common, verifyEmail: false }
    case 'dob':
      return { widgetType: 'dob', ...common, minAge: '', maxAge: '' }
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      throw new AuthoringError('configuration_invalid', 'Unsupported family member widget type')
    }
  }
}

/**
 * UI-only: append a member to the draft (does not mutate FormDefinition).
 */
export function draftAddFamilyMember(
  draft: FamilyRepeaterDraftContent,
  input: {
    readonly widgetType: FamilyMemberWidgetType
    readonly labelEn: string
    readonly labelGu: string
    readonly required: boolean
  },
): FamilyRepeaterDraftContent {
  const existing = new Set(draft.members.map((member) => member.propertyName))
  const propertyName = allocateMemberPropertyId(existing, input.widgetType)
  return {
    ...draft,
    members: [
      ...draft.members,
      {
        propertyName,
        configuration: createDefaultFamilyMemberConfiguration(input.widgetType, input),
      },
    ],
  }
}

/**
 * UI-only: remove a member from the draft. Blocks removing the last member.
 */
export function draftRemoveFamilyMember(
  draft: FamilyRepeaterDraftContent,
  propertyName: string,
): FamilyRepeaterDraftContent {
  if (draft.members.length <= 1) {
    throw new AuthoringError(
      'configuration_invalid',
      'Cannot remove the last family repeater member',
    )
  }
  if (!draft.members.some((member) => member.propertyName === propertyName)) {
    throw new AuthoringError('field_not_found', `Member not found: ${propertyName}`)
  }
  return {
    ...draft,
    members: draft.members.filter((member) => member.propertyName !== propertyName),
  }
}

/**
 * UI-only: reorder a member earlier/later in the draft.
 */
export function draftMoveFamilyMember(
  draft: FamilyRepeaterDraftContent,
  propertyName: string,
  direction: 'earlier' | 'later',
): FamilyRepeaterDraftContent {
  const index = draft.members.findIndex((member) => member.propertyName === propertyName)
  if (index < 0) {
    throw new AuthoringError('field_not_found', `Member not found: ${propertyName}`)
  }
  const targetIndex = direction === 'earlier' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= draft.members.length) {
    throw new AuthoringError('configuration_invalid', 'Cannot move member further')
  }
  const nextMembers = [...draft.members]
  const swapWith = nextMembers[targetIndex]!
  nextMembers[index] = swapWith
  nextMembers[targetIndex] = draft.members[index]!
  return { ...draft, members: nextMembers }
}

/**
 * Convert a validated family-repeater draft into the accepted apply payload.
 */
export function acceptedFamilyRepeaterConfigurationFromDraft(
  draft: FamilyRepeaterDraftContent,
): FamilyRepeaterAcceptedConfiguration {
  const validated = validateFamilyRepeaterDraftContent(draft)
  if (!validated.ok) {
    throw new AuthoringError('configuration_invalid', 'Family repeater draft failed validation')
  }
  const maxParsed = parseOptionalNonnegativeSafeIntegerString(draft.maxItems)
  const minParsed = parseOptionalNonnegativeSafeIntegerString(draft.minItems)
  if (!maxParsed.ok || maxParsed.value === undefined) {
    throw new AuthoringError('configuration_invalid', 'Family repeater maxItems is invalid')
  }
  if (!minParsed.ok) {
    throw new AuthoringError('configuration_invalid', 'Family repeater minItems is invalid')
  }
  const members: {
    readonly propertyName: string
    readonly configuration: FieldConfiguration
  }[] = []
  for (const member of draft.members) {
    const memberValidation = validateFieldConfigurationDraft(member.configuration)
    if (!memberValidation.ok) {
      throw new AuthoringError('configuration_invalid', 'Member configuration failed validation')
    }
    members.push({
      propertyName: member.propertyName,
      configuration: memberValidation.configuration,
    })
  }
  return {
    labelEn: draft.labelEn,
    labelGu: draft.labelGu,
    helpEn: draft.helpEn,
    helpGu: draft.helpGu,
    minItems: minParsed.value,
    maxItems: maxParsed.value,
    members,
  }
}

/** Aggregate member-structure keys for every family-repeater root (preview remount). */
export function familyRepeaterPreviewStructureKey(definition: FormDefinition): string {
  const roots = definition.meta.paletteProvenance
    .filter((entry) => entry.widgetType === 'family-repeater')
    .map((entry) => entry.fieldId)
    .sort()
  return JSON.stringify(
    roots.map((fieldId) => [
      fieldId,
      serializeFamilyRepeaterMemberStructureKey(definition, fieldId),
    ]),
  )
}

import type { FormDefinition, JsonObject } from '@dg20/form-contract'
import { getPaletteWidget } from '@dg20/form-widgets'

import { AuthoringError } from './types.js'
import { isAdmittedCitizenSchema, isCitizenWidgetType } from './citizen-schema-admission.js'
import {
  isEditableWidgetType,
  type FieldConfiguration,
  type FieldConfigurationDraft,
} from './property-config-types.js'
import {
  readAgeExtension,
  readCascadingMasterListIds,
  readDefaultStateCodeDraft,
  readDigiLockerDocumentTypeCodeDraft,
  readDocUploadPolicyDrafts,
  readFeeRuleIdDraft,
  readDeclarationIdDraft,
  readMasterListId,
  readMultiselectBoundDrafts,
  readVerifyEmail,
} from './x-dg20-authoring.js'
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
import { isAdmittedFamilyRepeaterSchema } from './family-repeater-schema-admission.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function schemaString(schema: Record<string, unknown>, key: string): string {
  const value = schema[key]
  return typeof value === 'string' ? value : ''
}

function schemaNumberAsString(schema: Record<string, unknown>, key: string): string {
  const value = schema[key]
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function readRequired(definition: FormDefinition, fieldId: string): boolean {
  const required = definition.jsonSchema['required']
  return Array.isArray(required) && required.includes(fieldId)
}

function readHelpPair(
  definition: FormDefinition,
  fieldId: string,
): { helpEn: string; helpGu: string } {
  const help = definition.meta.bilingual.help[fieldId]
  if (!help) {
    return { helpEn: '', helpGu: '' }
  }
  return { helpEn: help.en, helpGu: help.gu }
}

function readLabels(
  definition: FormDefinition,
  fieldId: string,
): {
  labelEn: string
  labelGu: string
} {
  const label = definition.meta.bilingual.labels[fieldId]
  if (!label) {
    throw new AuthoringError('inconsistent_definition', 'Field is missing bilingual labels')
  }
  return { labelEn: label.en, labelGu: label.gu }
}

/**
 * Read the governed editable configuration for a field from a FormDefinition.
 * Throws {@link AuthoringError} when the field is missing, unsupported, or
 * the definition is inconsistent.
 */
export function readFieldConfiguration(
  definition: FormDefinition,
  fieldId: string,
): FieldConfiguration {
  const properties = definition.jsonSchema['properties']
  if (!isPlainObject(properties) || !(fieldId in properties)) {
    throw new AuthoringError('field_not_found', `Field not found: ${fieldId}`)
  }
  const provenance = definition.meta.paletteProvenance.find((entry) => entry.fieldId === fieldId)
  if (!provenance) {
    throw new AuthoringError('field_not_found', `Field not found in provenance: ${fieldId}`)
  }
  if (!isEditableWidgetType(provenance.widgetType)) {
    throw new AuthoringError(
      'unsupported_property_editor',
      'Property editor is not available for this widget type',
    )
  }

  const schemaRaw = properties[fieldId]
  if (!isPlainObject(schemaRaw)) {
    throw new AuthoringError('inconsistent_definition', 'Field schema must be an object')
  }
  if (provenance.widgetType === 'family-repeater') {
    if (!isAdmittedFamilyRepeaterSchema(schemaRaw)) {
      throw new AuthoringError(
        'inconsistent_definition',
        'Family repeater field schema does not match governed invariants',
      )
    }
    const labels = readLabels(definition, fieldId)
    const help = readHelpPair(definition, fieldId)
    return {
      widgetType: 'family-repeater',
      ...labels,
      ...help,
      minItems: Object.prototype.hasOwnProperty.call(schemaRaw, 'minItems')
        ? schemaNumberAsString(schemaRaw as Record<string, unknown>, 'minItems')
        : '',
      maxItems: schemaNumberAsString(schemaRaw as Record<string, unknown>, 'maxItems'),
    }
  }
  if (
    isCitizenWidgetType(provenance.widgetType) &&
    !isAdmittedCitizenSchema(provenance.widgetType, schemaRaw)
  ) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Citizen field schema does not match governed invariants',
    )
  }
  if (
    isAddressPhotoWidgetType(provenance.widgetType) &&
    !isAdmittedAddressPhotoSchema(provenance.widgetType, schemaRaw)
  ) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Address/photo field schema does not match governed invariants',
    )
  }
  if (
    isDocDigiLockerWidgetType(provenance.widgetType) &&
    !isAdmittedDocDigiLockerSchema(provenance.widgetType, schemaRaw)
  ) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Document/DigiLocker field schema does not match governed invariants',
    )
  }
  if (
    isFeeEsignWidgetType(provenance.widgetType) &&
    !isAdmittedFeeEsignSchema(provenance.widgetType, schemaRaw)
  ) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Fee/eSign field schema does not match governed invariants',
    )
  }
  if (
    isEligibilityDeclarationWidgetType(provenance.widgetType) &&
    !isAdmittedEligibilityDeclarationSchema(schemaRaw)
  ) {
    throw new AuthoringError(
      'inconsistent_definition',
      'Eligibility declaration field schema does not match governed invariants',
    )
  }
  if (isCafPrefillWidgetType(provenance.widgetType) && !isAdmittedCafPrefillSchema(schemaRaw)) {
    throw new AuthoringError(
      'inconsistent_definition',
      'CAF prefill field schema does not match governed invariants',
    )
  }
  const schema = schemaRaw as Record<string, unknown>
  const labels = readLabels(definition, fieldId)
  const help = readHelpPair(definition, fieldId)
  const required = readRequired(definition, fieldId)
  const palette = getPaletteWidget(provenance.widgetType)

  switch (provenance.widgetType) {
    case 'text-short':
      return {
        widgetType: 'text-short',
        ...labels,
        ...help,
        required,
        maxLength:
          typeof schema['maxLength'] === 'number' && Number.isSafeInteger(schema['maxLength'])
            ? String(schema['maxLength'])
            : '120',
        pattern: schemaString(schema, 'pattern'),
      }
    case 'text-long':
      return {
        widgetType: 'text-long',
        ...labels,
        ...help,
        required,
        maxLength:
          typeof schema['maxLength'] === 'number' && Number.isSafeInteger(schema['maxLength'])
            ? String(schema['maxLength'])
            : '1000',
      }
    case 'number':
      return {
        widgetType: 'number',
        ...labels,
        ...help,
        required,
        minimum: schemaNumberAsString(schema, 'minimum'),
        maximum: schemaNumberAsString(schema, 'maximum'),
        step: schemaNumberAsString(schema, 'multipleOf'),
      }
    case 'currency-inr':
      return {
        widgetType: 'currency-inr',
        ...labels,
        ...help,
        required,
        minimum:
          typeof schema['minimum'] === 'number' &&
          Number.isFinite(schema['minimum']) &&
          schema['minimum'] !== 0
            ? String(schema['minimum'])
            : '',
        maximum: schemaNumberAsString(schema, 'maximum'),
      }
    case 'percentage':
      return {
        widgetType: 'percentage',
        ...labels,
        ...help,
        required,
      }
    case 'gender':
      return {
        widgetType: 'gender',
        ...labels,
        ...help,
        required,
      }
    case 'yesno':
      return {
        widgetType: 'yesno',
        ...labels,
        ...help,
        required,
      }
    case 'section-header':
      return {
        widgetType: 'section-header',
        ...labels,
        ...help,
      }
    case 'info-panel':
      return {
        widgetType: 'info-panel',
        ...labels,
        ...help,
      }
    case 'email':
      return {
        widgetType: 'email',
        ...labels,
        ...help,
        required,
        verifyEmail: readVerifyEmail(schema),
      }
    case 'full-name':
      return {
        widgetType: 'full-name',
        ...labels,
        ...help,
        required,
      }
    case 'dob':
      return {
        widgetType: 'dob',
        ...labels,
        ...help,
        required,
        minAge: readAgeExtension(schema, 'minAge'),
        maxAge: readAgeExtension(schema, 'maxAge'),
      }
    case 'pincode':
      return {
        widgetType: 'pincode',
        ...labels,
        ...help,
        required,
      }
    case 'aadhaar':
      return {
        widgetType: 'aadhaar',
        ...labels,
        ...help,
        required,
      }
    case 'mobile-otp':
      return {
        widgetType: 'mobile-otp',
        ...labels,
        ...help,
        required,
      }
    case 'bank-account':
      return {
        widgetType: 'bank-account',
        ...labels,
        ...help,
        required,
      }
    case 'address-block':
      return {
        widgetType: 'address-block',
        ...labels,
        ...help,
        required,
        defaultStateCode: readDefaultStateCodeDraft(schema),
      }
    case 'photo-capture':
      return {
        widgetType: 'photo-capture',
        ...labels,
        ...help,
        required,
      }
    case 'dropdown-master':
      return {
        widgetType: 'dropdown-master',
        ...labels,
        ...help,
        required,
        masterListId: readMasterListId(schema),
      }
    case 'radio':
      return {
        widgetType: 'radio',
        ...labels,
        ...help,
        required,
        masterListId: readMasterListId(schema),
      }
    case 'multiselect': {
      const bounds = readMultiselectBoundDrafts(schema)
      return {
        widgetType: 'multiselect',
        ...labels,
        ...help,
        required,
        masterListId: readMasterListId(schema),
        minItems: bounds.minItems,
        maxItems: bounds.maxItems,
      }
    }
    case 'cascading-dropdown': {
      const ids = readCascadingMasterListIds(schema)
      return {
        widgetType: 'cascading-dropdown',
        ...labels,
        ...help,
        required,
        parentMasterListId: ids.parentMasterListId,
        childMasterListId: ids.childMasterListId,
      }
    }
    case 'doc-upload': {
      const policy = readDocUploadPolicyDrafts(schema)
      return {
        widgetType: 'doc-upload',
        ...labels,
        ...help,
        required,
        allowedMimeTypesText: policy.allowedMimeTypesText,
        maxFileSizeBytes: policy.maxFileSizeBytes,
      }
    }
    case 'digilocker-fetch':
      return {
        widgetType: 'digilocker-fetch',
        ...labels,
        ...help,
        required,
        digiLockerDocumentTypeCode: readDigiLockerDocumentTypeCodeDraft(schema),
      }
    case 'fee-field':
      return {
        widgetType: 'fee-field',
        ...labels,
        ...help,
        feeRuleId: readFeeRuleIdDraft(schema),
      }
    case 'signature-esign':
      return {
        widgetType: 'signature-esign',
        ...labels,
        ...help,
        required,
      }
    case 'eligibility-declaration':
      return {
        widgetType: 'eligibility-declaration',
        ...labels,
        ...help,
        declarationId: readDeclarationIdDraft(schema),
      }
    case 'caf-prefill':
      return {
        widgetType: 'caf-prefill',
        ...labels,
        ...help,
      }
    default: {
      const _exhaustive: never = provenance.widgetType
      void _exhaustive
      void palette
      throw new AuthoringError(
        'unsupported_property_editor',
        'Property editor is not available for this widget type',
      )
    }
  }
}

/** Clone a committed configuration into a mutable UI draft object. */
export function configurationToDraft(configuration: FieldConfiguration): FieldConfigurationDraft {
  return { ...configuration }
}

/**
 * Structural equality for dirty detection. Compares every governed draft field
 * as strings/numbers/booleans — no JSON serialization of hostile values.
 */
export function isConfigurationDirty(
  committed: FieldConfiguration,
  draft: FieldConfigurationDraft,
): boolean {
  if (committed.widgetType !== draft.widgetType) {
    return true
  }
  const left = committed as unknown as Record<string, unknown>
  const right = draft as unknown as Record<string, unknown>
  for (const key of Object.keys(left)) {
    if (left[key] !== right[key]) {
      return true
    }
  }
  for (const key of Object.keys(right)) {
    if (!(key in left)) {
      return true
    }
  }
  return false
}

/** Whether a field currently has a dirty editor draft in the UI draft map. */
export function hasDirtyEditorDraft(
  drafts: Readonly<Record<string, FieldConfigurationDraft>>,
  definition: FormDefinition,
  fieldId: string,
): boolean {
  const draft = drafts[fieldId]
  if (!draft) {
    return false
  }
  try {
    const committed = readFieldConfiguration(definition, fieldId)
    return isConfigurationDirty(committed, draft)
  } catch {
    return true
  }
}

export function listDirtyFieldIds(
  drafts: Readonly<Record<string, FieldConfigurationDraft>>,
  definition: FormDefinition,
): readonly string[] {
  return Object.keys(drafts).filter((fieldId) => hasDirtyEditorDraft(drafts, definition, fieldId))
}

/** Ensure a draft exists for the field; returns the draft (existing or freshly seeded). */
export function ensureEditorDraft(
  drafts: Readonly<Record<string, FieldConfigurationDraft>>,
  definition: FormDefinition,
  fieldId: string,
): {
  readonly drafts: Readonly<Record<string, FieldConfigurationDraft>>
  readonly draft: FieldConfigurationDraft
} {
  const existing = drafts[fieldId]
  if (existing) {
    return { drafts, draft: existing }
  }
  const committed = readFieldConfiguration(definition, fieldId)
  const draft = configurationToDraft(committed)
  return {
    drafts: { ...drafts, [fieldId]: draft },
    draft,
  }
}

/**
 * Seed a new editor draft + immutable committed baseline from the live definition.
 * Callers preserve `baseline` across patches until Cancel/Apply refresh both.
 */
export function seedEditorDraftWithBaseline(
  definition: FormDefinition,
  fieldId: string,
): {
  readonly draft: FieldConfigurationDraft
  readonly baseline: FieldConfiguration
} {
  const committed = readFieldConfiguration(definition, fieldId)
  return {
    draft: configurationToDraft(committed),
    baseline: configurationToDraft(committed),
  }
}

export function removeEditorDraft(
  drafts: Readonly<Record<string, FieldConfigurationDraft>>,
  fieldId: string,
): Readonly<Record<string, FieldConfigurationDraft>> {
  if (!(fieldId in drafts)) {
    return drafts
  }
  const next: Record<string, FieldConfigurationDraft> = { ...drafts }
  delete next[fieldId]
  return next
}

/** Type guard helper for schema property bags used during apply. */
export function asSchemaObject(value: unknown): JsonObject {
  if (!isPlainObject(value)) {
    throw new AuthoringError('inconsistent_definition', 'Field schema must be an object')
  }
  return value as JsonObject
}

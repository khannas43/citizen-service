import type { FormDefinition, JsonObject } from '@citizen/form-contract'
import { getPaletteWidget } from '@citizen/form-widgets'

import { parseOptionalNonnegativeSafeIntegerString } from './age-integer.js'
import { isAdmittedCitizenSchema, isCitizenWidgetType } from './citizen-schema-admission.js'
import {
  isAdmittedGovernedMasterDataSchema,
  isGovernedMasterDataWidgetType,
} from './master-data-schema-admission.js'
import {
  isAdmittedAddressPhotoSchema,
  isAddressPhotoWidgetType,
} from './address-photo-schema-admission.js'
import { cloneJsonSafeObject } from './clone.js'
import {
  isAdmittedDocDigiLockerSchema,
  isDocDigiLockerWidgetType,
} from './doc-digilocker-schema-admission.js'
import { parseAllowedMimeTypesText, parseMaxFileSizeBytesDraft } from './doc-digilocker-policy.js'
import { isAdmittedFeeEsignSchema, isFeeEsignWidgetType } from './fee-esign-schema-admission.js'
import {
  isAdmittedEligibilityDeclarationSchema,
  isEligibilityDeclarationWidgetType,
} from './eligibility-declaration-schema-admission.js'
import {
  isAdmittedCafPrefillSchema,
  isCafPrefillWidgetType,
} from './caf-prefill-schema-admission.js'
import { assertDefinitionIntegrity, readUiOrder } from './integrity.js'
import { parseOptionalJsonDecimal } from './json-decimal.js'
import { type FieldConfiguration, isEditableWidgetType } from './property-config-types.js'
import {
  asSchemaObject,
  isConfigurationDirty,
  readFieldConfiguration,
} from './read-field-configuration.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'
import { validateFieldConfigurationDraft } from './validate-field-configuration.js'
import {
  applyCanonicalAddressBlockXDg20,
  applyCanonicalCascadingSchema,
  applyCanonicalDigiLockerSchema,
  applyCanonicalDobXDg20,
  applyCanonicalDocUploadSchema,
  applyCanonicalEmailXDg20,
  applyCanonicalFeeFieldSchema,
  applyCanonicalEligibilityDeclarationSchema,
  applyCanonicalMasterListXDg20,
  applyCanonicalMultiselectSchema,
} from './x-dg20-authoring.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseOptionalFinite(raw: string): number | undefined {
  const parsed = parseOptionalJsonDecimal(raw)
  if (!parsed.ok) {
    return undefined
  }
  return parsed.value
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

function applyRequired(
  jsonSchema: JsonObject,
  fieldId: string,
  required: boolean,
  uiOrder: readonly string[],
): JsonObject {
  const existingRaw = jsonSchema['required']
  const existing = Array.isArray(existingRaw)
    ? existingRaw.filter((item): item is string => typeof item === 'string')
    : []
  const without = existing.filter((id) => id !== fieldId)
  const nextRequired = required
    ? uiOrder.filter((id) => without.includes(id) || id === fieldId)
    : without
  const next: Record<string, unknown> = { ...jsonSchema }
  if (nextRequired.length === 0) {
    delete next['required']
  } else {
    next['required'] = nextRequired
  }
  return next as JsonObject
}

/** Apply governed schema constraints for an accepted field configuration (shared with FB-D16 members). */
export function applySchemaConstraints(
  schema: JsonObject,
  configuration: FieldConfiguration,
): JsonObject {
  const next: Record<string, unknown> = { ...schema }

  switch (configuration.widgetType) {
    case 'text-short': {
      next['type'] = 'string'
      next['maxLength'] = Number(configuration.maxLength)
      if (configuration.pattern.length === 0) {
        delete next['pattern']
      } else {
        next['pattern'] = configuration.pattern
      }
      break
    }
    case 'text-long': {
      next['type'] = 'string'
      next['maxLength'] = Number(configuration.maxLength)
      break
    }
    case 'number': {
      next['type'] = 'number'
      const minimum = parseOptionalFinite(configuration.minimum)
      const maximum = parseOptionalFinite(configuration.maximum)
      const step = parseOptionalFinite(configuration.step)
      if (minimum === undefined) delete next['minimum']
      else next['minimum'] = minimum
      if (maximum === undefined) delete next['maximum']
      else next['maximum'] = maximum
      if (step === undefined) delete next['multipleOf']
      else next['multipleOf'] = step
      break
    }
    case 'currency-inr': {
      next['type'] = 'number'
      next['multipleOf'] = 0.01
      const minimum = parseOptionalFinite(configuration.minimum)
      next['minimum'] = minimum === undefined ? 0 : minimum
      const maximum = parseOptionalFinite(configuration.maximum)
      if (maximum === undefined) delete next['maximum']
      else next['maximum'] = maximum
      break
    }
    case 'percentage': {
      next['type'] = 'number'
      next['minimum'] = 0
      next['maximum'] = 100
      break
    }
    case 'gender': {
      next['type'] = 'string'
      next['enum'] = ['M', 'F', 'OTHER']
      break
    }
    case 'yesno': {
      next['type'] = 'boolean'
      delete next['enum']
      break
    }
    case 'section-header':
    case 'info-panel': {
      next['type'] = 'object'
      next['properties'] = isPlainObject(next['properties']) ? next['properties'] : {}
      next['additionalProperties'] = false
      break
    }
    case 'email': {
      // Admitted schema preserved; only canonical x-dg20.verifyEmail is governed.
      return applyCanonicalEmailXDg20(schema, configuration.verifyEmail)
    }
    case 'full-name':
    case 'pincode':
    case 'aadhaar':
    case 'mobile-otp':
    case 'bank-account':
    case 'photo-capture':
    case 'signature-esign':
    case 'caf-prefill':
    case 'family-repeater': {
      // Labels/help/root-required only — preserve admitted schema structure.
      // Family-repeater bounds/members apply via updateFamilyRepeaterConfiguration.
      return schema
    }
    case 'address-block': {
      return applyCanonicalAddressBlockXDg20(schema, configuration.defaultStateCode)
    }
    case 'dob': {
      const minParsed = parseOptionalNonnegativeSafeIntegerString(configuration.minAge)
      const maxParsed = parseOptionalNonnegativeSafeIntegerString(configuration.maxAge)
      return applyCanonicalDobXDg20(schema, {
        minAge: minParsed.ok && minParsed.value !== undefined ? minParsed.value : undefined,
        maxAge: maxParsed.ok && maxParsed.value !== undefined ? maxParsed.value : undefined,
      })
    }
    case 'dropdown-master':
    case 'radio': {
      return applyCanonicalMasterListXDg20(schema, configuration.masterListId)
    }
    case 'multiselect': {
      const minParsed = parseOptionalNonnegativeSafeIntegerString(configuration.minItems)
      const maxParsed = parseOptionalNonnegativeSafeIntegerString(configuration.maxItems)
      return applyCanonicalMultiselectSchema(schema, {
        masterListId: configuration.masterListId,
        minItems: minParsed.ok ? minParsed.value : undefined,
        maxItems: maxParsed.ok ? maxParsed.value : undefined,
      })
    }
    case 'cascading-dropdown': {
      return applyCanonicalCascadingSchema(schema, {
        parentMasterListId: configuration.parentMasterListId,
        childMasterListId: configuration.childMasterListId,
      })
    }
    case 'doc-upload': {
      const mime = parseAllowedMimeTypesText(configuration.allowedMimeTypesText)
      const size = parseMaxFileSizeBytesDraft(configuration.maxFileSizeBytes)
      if (!mime.ok || !size.ok) {
        // validateFieldConfigurationDraft already gated these; defensive only.
        return schema
      }
      return applyCanonicalDocUploadSchema(schema, {
        allowedMimeTypes: mime.allowedMimeTypes,
        maxFileSizeBytes: size.maxFileSizeBytes,
      })
    }
    case 'digilocker-fetch': {
      return applyCanonicalDigiLockerSchema(schema, configuration.digiLockerDocumentTypeCode)
    }
    case 'fee-field': {
      return applyCanonicalFeeFieldSchema(schema, configuration.feeRuleId)
    }
    case 'eligibility-declaration': {
      return applyCanonicalEligibilityDeclarationSchema(schema, configuration.declarationId)
    }
    default: {
      const _exhaustive: never = configuration
      void _exhaustive
      break
    }
  }

  return next as JsonObject
}

/**
 * Atomically apply an accepted field configuration.
 *
 * - Runs integrity before and after
 * - Confirms field exists and provenance widgetType matches
 * - Compares the live committed configuration to `expectedBaseline`
 *   (stale_editor_draft when they differ — FB-D2.1)
 * - Strict-clones before mutation
 * - Applies only governed properties for that widget
 * - Preserves selection and previewFormData
 * - Returns no partial mutation on failure
 */
export function updateFieldConfiguration(
  state: BuilderAuthoringState,
  fieldId: string,
  acceptedConfiguration: FieldConfiguration,
  expectedBaseline: FieldConfiguration,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const validation = validateFieldConfigurationDraft(acceptedConfiguration)
  if (!validation.ok) {
    return {
      ok: false,
      error: new AuthoringError('configuration_invalid', 'Field configuration failed validation'),
    }
  }

  const provenance = state.definition.meta.paletteProvenance.find(
    (entry) => entry.fieldId === fieldId,
  )
  if (!provenance) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${fieldId}`),
    }
  }
  if (!isEditableWidgetType(provenance.widgetType)) {
    return {
      ok: false,
      error: new AuthoringError(
        'unsupported_property_editor',
        'Property editor is not available for this widget type',
      ),
    }
  }
  if (provenance.widgetType !== acceptedConfiguration.widgetType) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_widget_mismatch',
        'Configuration widgetType does not match field provenance',
      ),
    }
  }

  let committed: FieldConfiguration
  try {
    committed = readFieldConfiguration(state.definition, fieldId)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  if (committed.widgetType !== expectedBaseline.widgetType) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_widget_mismatch',
        'Configuration widgetType does not match field provenance',
      ),
    }
  }

  // Structural primitive equality against the draft's immutable committed baseline.
  if (isConfigurationDirty(committed, expectedBaseline)) {
    return {
      ok: false,
      error: new AuthoringError(
        'stale_editor_draft',
        'Committed field properties changed since this editor draft was opened',
      ),
    }
  }

  const palette = getPaletteWidget(provenance.widgetType)
  const wantsRequired =
    'required' in acceptedConfiguration
      ? Boolean((acceptedConfiguration as { required?: boolean }).required)
      : false
  if (wantsRequired && !palette?.supportsRequired) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'This widget type does not support required',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition

  const propertiesRaw = nextDefinition.jsonSchema['properties']
  if (!isPlainObject(propertiesRaw) || !(fieldId in propertiesRaw)) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${fieldId}`),
    }
  }

  const previousSchema = asSchemaObject(propertiesRaw[fieldId])
  if (
    isCitizenWidgetType(provenance.widgetType) &&
    !isAdmittedCitizenSchema(provenance.widgetType, previousSchema)
  ) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Citizen field schema does not match governed invariants',
      ),
    }
  }
  if (
    isGovernedMasterDataWidgetType(provenance.widgetType) &&
    !isAdmittedGovernedMasterDataSchema(provenance.widgetType, previousSchema)
  ) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Master-data field schema does not match governed invariants',
      ),
    }
  }
  if (
    isAddressPhotoWidgetType(provenance.widgetType) &&
    !isAdmittedAddressPhotoSchema(provenance.widgetType, previousSchema)
  ) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Address/photo field schema does not match governed invariants',
      ),
    }
  }
  if (
    isDocDigiLockerWidgetType(provenance.widgetType) &&
    !isAdmittedDocDigiLockerSchema(provenance.widgetType, previousSchema)
  ) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Document/DigiLocker field schema does not match governed invariants',
      ),
    }
  }
  if (
    isFeeEsignWidgetType(provenance.widgetType) &&
    !isAdmittedFeeEsignSchema(provenance.widgetType, previousSchema)
  ) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Fee/eSign field schema does not match governed invariants',
      ),
    }
  }
  if (
    isEligibilityDeclarationWidgetType(provenance.widgetType) &&
    !isAdmittedEligibilityDeclarationSchema(previousSchema)
  ) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Eligibility declaration field schema does not match governed invariants',
      ),
    }
  }
  if (
    isCafPrefillWidgetType(provenance.widgetType) &&
    !isAdmittedCafPrefillSchema(previousSchema)
  ) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'CAF prefill field schema does not match governed invariants',
      ),
    }
  }
  const nextSchema = applySchemaConstraints(previousSchema, acceptedConfiguration)
  const properties = { ...propertiesRaw, [fieldId]: nextSchema }

  const uiOrder = readUiOrder(nextDefinition)
  let jsonSchema: JsonObject = {
    ...nextDefinition.jsonSchema,
    properties,
  }
  if ('required' in acceptedConfiguration) {
    jsonSchema = applyRequired(
      jsonSchema,
      fieldId,
      Boolean((acceptedConfiguration as { required: boolean }).required),
      uiOrder,
    )
  }

  const labels = {
    ...nextDefinition.meta.bilingual.labels,
    [fieldId]: {
      en: acceptedConfiguration.labelEn,
      gu: acceptedConfiguration.labelGu,
    },
  }
  const help = applyOptionalPair(
    nextDefinition.meta.bilingual.help,
    fieldId,
    acceptedConfiguration.helpEn,
    acceptedConfiguration.helpGu,
  )

  // Property Apply never writes or removes meta.bilingual.errors (FB-D3.1).
  const definition: FormDefinition = {
    ...nextDefinition,
    jsonSchema,
    meta: {
      ...nextDefinition.meta,
      bilingual: {
        ...nextDefinition.meta.bilingual,
        labels,
        help,
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
    announcementVars: { label: acceptedConfiguration.labelEn },
  }
}

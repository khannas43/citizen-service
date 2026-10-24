import type { FormDefinition, JsonObject } from '@dg20/form-contract'

import { cloneJsonSafeObject } from './clone.js'
import { allocateFieldId } from './field-ids.js'
import { allocateMemberPropertyId, familyMemberDefinitionPath } from './family-repeater-paths.js'
import {
  assertDefinitionIntegrity,
  findStepIndexForField,
  readUiOrder,
  syncStepFieldIdsToUiOrder,
} from './integrity.js'
import {
  defaultBilingualLabel,
  defaultHelpContent,
  getAuthoringTemplate,
  isConfiguredAddableWidgetType,
  isStructuralAddableWidgetType,
  type ConfiguredAddTemplateInput,
} from './templates.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'

export type AddFieldOptions = {
  readonly configured?: ConfiguredAddTemplateInput
}

function addFamilyRepeaterField(
  state: BuilderAuthoringState,
  configured: Extract<ConfiguredAddTemplateInput, { widgetType: 'family-repeater' }>,
): AuthoringResult {
  const template = getAuthoringTemplate('family-repeater')
  if (!template || template.addMode !== 'configured') {
    return {
      ok: false,
      error: new AuthoringError(
        'widget_not_addable',
        'Widget type is not addable: family-repeater',
      ),
    }
  }

  const memberTemplate = getAuthoringTemplate(configured.initialMember.widgetType)
  if (!memberTemplate || memberTemplate.addMode !== 'immediate') {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Family repeater initial member template is not available',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const fieldId = allocateFieldId(nextDefinition, 'family-repeater')
  const memberPropertyName =
    configured.initialMember.propertyName ??
    allocateMemberPropertyId(new Set(), configured.initialMember.widgetType)
  const nestedPath = familyMemberDefinitionPath(fieldId, memberPropertyName)
  const childSchema = memberTemplate.buildSchema() as JsonObject

  const items: Record<string, unknown> = {
    type: 'object',
    properties: {
      [memberPropertyName]: childSchema,
    },
    additionalProperties: false,
  }
  if (configured.initialMember.required) {
    items.required = [memberPropertyName]
  }

  const fieldSchema: Record<string, unknown> = {
    type: 'array',
    items,
    maxItems: configured.maxItems,
  }
  if (configured.minItems !== undefined) {
    fieldSchema.minItems = configured.minItems
  }

  const labels = defaultBilingualLabel('family-repeater')
  const memberLabels = {
    en: configured.initialMember.labelEn,
    gu: configured.initialMember.labelGu,
  }

  const properties = {
    ...(nextDefinition.jsonSchema.properties as Record<string, JsonObject>),
    [fieldId]: fieldSchema as JsonObject,
  }

  const uiOrder = [...readUiOrder(nextDefinition)]
  const selected = state.selectedFieldId
  let insertIndex = uiOrder.length
  if (selected !== null) {
    const selectedIndex = uiOrder.indexOf(selected)
    if (selectedIndex < 0) {
      return {
        ok: false,
        error: new AuthoringError('field_not_found', `Selected field not found: ${selected}`),
      }
    }
    insertIndex = selectedIndex + 1
  }
  uiOrder.splice(insertIndex, 0, fieldId)

  const uiSchema: Record<string, unknown> = {
    ...nextDefinition.uiSchema,
    [fieldId]: {
      'ui:field': 'family-repeater',
      items: {
        [memberPropertyName]: memberTemplate.buildUiSchemaEntry(),
      },
    },
    'ui:order': uiOrder,
  }

  const provenance = [
    ...nextDefinition.meta.paletteProvenance,
    { fieldId, widgetType: 'family-repeater' as const },
    { fieldId: nestedPath, widgetType: configured.initialMember.widgetType },
  ]

  const bilingualLabels = {
    ...nextDefinition.meta.bilingual.labels,
    [fieldId]: labels,
    [nestedPath]: memberLabels,
  }

  let progressiveSteps = nextDefinition.meta.progressiveSteps
  if (progressiveSteps.length > 0) {
    let targetStepIndex: number
    if (selected !== null) {
      targetStepIndex = findStepIndexForField(progressiveSteps, selected)
      if (targetStepIndex < 0) {
        return {
          ok: false,
          error: new AuthoringError(
            'inconsistent_definition',
            `Selected field not in any progressive step: ${selected}`,
          ),
        }
      }
    } else {
      targetStepIndex = progressiveSteps.length - 1
    }

    progressiveSteps = progressiveSteps.map((step, index) => {
      if (index !== targetStepIndex) {
        return step
      }
      const fieldIds = [...step.fieldIds, fieldId]
      return {
        ...step,
        fieldIds: syncStepFieldIdsToUiOrder(fieldIds, uiOrder),
      }
    })
  }

  const definition: FormDefinition = {
    ...nextDefinition,
    jsonSchema: {
      ...nextDefinition.jsonSchema,
      properties,
    },
    uiSchema: uiSchema as FormDefinition['uiSchema'],
    meta: {
      ...nextDefinition.meta,
      paletteProvenance: provenance,
      bilingual: {
        ...nextDefinition.meta.bilingual,
        labels: bilingualLabels,
      },
      progressiveSteps,
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
      selectedFieldId: fieldId,
      // No preview rows for a newly added family-repeater.
      previewFormData: state.previewFormData,
    },
    announcementKey: 'announceFieldAdded',
    announcementVars: { label: labels.en, fieldId },
  }
}

/**
 * Add a field immediately after the selected field (or append when none selected).
 * Configured-add widgets require `options.configured` — never invent placeholders.
 */
export function addField(
  state: BuilderAuthoringState,
  widgetType: string,
  options?: AddFieldOptions,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  if (isStructuralAddableWidgetType(widgetType)) {
    return {
      ok: false,
      error: new AuthoringError(
        'structural_widget_requires_boundary_action',
        `Structural widget requires boundary action: ${widgetType}`,
      ),
    }
  }

  const template = getAuthoringTemplate(widgetType)
  if (!template) {
    return {
      ok: false,
      error: new AuthoringError('widget_not_addable', `Widget type is not addable: ${widgetType}`),
    }
  }

  if (widgetType === 'family-repeater') {
    const configured = options?.configured
    if (configured === undefined || configured.widgetType !== 'family-repeater') {
      return {
        ok: false,
        error: new AuthoringError(
          'configuration_invalid',
          'Configured add requires matching typed configured input',
        ),
      }
    }
    return addFamilyRepeaterField(state, configured)
  }

  let fieldSchema: JsonObject
  if (template.addMode === 'configured') {
    const configured = options?.configured
    if (configured === undefined || configured.widgetType !== widgetType) {
      return {
        ok: false,
        error: new AuthoringError(
          'configuration_invalid',
          'Configured add requires matching typed configured input',
        ),
      }
    }
    fieldSchema = template.buildSchema(configured)
  } else {
    if (options?.configured !== undefined) {
      return {
        ok: false,
        error: new AuthoringError(
          'configuration_invalid',
          'Immediate-add widgets do not accept configured add input',
        ),
      }
    }
    fieldSchema = template.buildSchema()
  }

  if (isConfiguredAddableWidgetType(widgetType) && template.addMode !== 'configured') {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Configured widget missing configured template',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const fieldId = allocateFieldId(nextDefinition, widgetType)
  const labels = defaultBilingualLabel(widgetType)
  const help =
    options?.configured?.widgetType === 'eligibility-declaration'
      ? {
          en: options.configured.declarationTextEn,
          gu: options.configured.declarationTextGu,
        }
      : defaultHelpContent(widgetType)

  const properties = {
    ...(nextDefinition.jsonSchema.properties as Record<string, JsonObject>),
    [fieldId]: fieldSchema,
  }

  const uiOrder = [...readUiOrder(nextDefinition)]
  const selected = state.selectedFieldId
  let insertIndex = uiOrder.length
  if (selected !== null) {
    const selectedIndex = uiOrder.indexOf(selected)
    if (selectedIndex < 0) {
      return {
        ok: false,
        error: new AuthoringError('field_not_found', `Selected field not found: ${selected}`),
      }
    }
    insertIndex = selectedIndex + 1
  }
  uiOrder.splice(insertIndex, 0, fieldId)

  const uiSchema: Record<string, unknown> = {
    ...nextDefinition.uiSchema,
    [fieldId]: template.buildUiSchemaEntry(),
    'ui:order': uiOrder,
  }

  const provenance = [
    ...nextDefinition.meta.paletteProvenance,
    { fieldId, widgetType: template.widgetType },
  ]

  const bilingualLabels = {
    ...nextDefinition.meta.bilingual.labels,
    [fieldId]: labels,
  }

  let progressiveSteps = nextDefinition.meta.progressiveSteps
  if (progressiveSteps.length > 0) {
    let targetStepIndex: number
    if (selected !== null) {
      targetStepIndex = findStepIndexForField(progressiveSteps, selected)
      if (targetStepIndex < 0) {
        return {
          ok: false,
          error: new AuthoringError(
            'inconsistent_definition',
            `Selected field not in any progressive step: ${selected}`,
          ),
        }
      }
    } else {
      targetStepIndex = progressiveSteps.length - 1
    }

    progressiveSteps = progressiveSteps.map((step, index) => {
      if (index !== targetStepIndex) {
        return step
      }
      const fieldIds = [...step.fieldIds, fieldId]
      return {
        ...step,
        fieldIds: syncStepFieldIdsToUiOrder(fieldIds, uiOrder),
      }
    })
  }

  const cafConfigured =
    options?.configured?.widgetType === 'caf-prefill' ? options.configured : undefined
  const prefillBindings =
    cafConfigured !== undefined
      ? [
          ...nextDefinition.meta.prefillBindings,
          {
            fieldId,
            cafAttribute: cafConfigured.cafAttribute,
            confidenceMin: cafConfigured.confidenceMin,
          },
        ]
      : nextDefinition.meta.prefillBindings

  const definition: FormDefinition = {
    ...nextDefinition,
    jsonSchema: {
      ...nextDefinition.jsonSchema,
      properties,
    },
    uiSchema: uiSchema as FormDefinition['uiSchema'],
    meta: {
      ...nextDefinition.meta,
      paletteProvenance: provenance,
      bilingual: {
        ...nextDefinition.meta.bilingual,
        labels: bilingualLabels,
        help:
          help !== null
            ? { ...nextDefinition.meta.bilingual.help, [fieldId]: help }
            : nextDefinition.meta.bilingual.help,
      },
      progressiveSteps,
      prefillBindings,
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
      selectedFieldId: fieldId,
      previewFormData: state.previewFormData,
    },
    announcementKey: 'announceFieldAdded',
    announcementVars: { label: labels.en, fieldId },
  }
}

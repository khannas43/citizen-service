import type { FormDefinition } from '@citizen/form-contract'

import { cloneJsonSafe } from './clone.js'
import { assertDefinitionIntegrity } from './integrity.js'
import { AuthoringError, type BuilderAuthoringState } from './types.js'

/**
 * Start a Builder session from a detached JSON-safe clone of the source definition.
 * Never mutates or returns the source reference.
 */
export function createAuthoringSession(source: FormDefinition): BuilderAuthoringState {
  const definition = cloneJsonSafe(source)
  assertDefinitionIntegrity(definition)

  const uiOrder = definition.uiSchema['ui:order']
  const firstFieldId = Array.isArray(uiOrder) && typeof uiOrder[0] === 'string' ? uiOrder[0] : null

  return {
    definition,
    selectedFieldId: firstFieldId,
    previewFormData: {},
  }
}

export function selectField(
  state: BuilderAuthoringState,
  fieldId: string | null,
): BuilderAuthoringState {
  if (fieldId === null) {
    return { ...state, selectedFieldId: null }
  }
  const properties = state.definition.jsonSchema['properties']
  if (
    properties === null ||
    typeof properties !== 'object' ||
    Array.isArray(properties) ||
    !Object.prototype.hasOwnProperty.call(properties, fieldId)
  ) {
    throw new AuthoringError('field_not_found', `Field not found: ${fieldId}`)
  }
  return { ...state, selectedFieldId: fieldId }
}

export function setPreviewFormData(
  state: BuilderAuthoringState,
  formData: Readonly<Record<string, unknown>>,
): BuilderAuthoringState {
  return {
    ...state,
    previewFormData: cloneJsonSafe(formData),
  }
}

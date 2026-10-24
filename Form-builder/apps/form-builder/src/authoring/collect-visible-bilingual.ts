import type { FormDefinition } from '@dg20/form-contract'

import {
  fieldBilingualFromParts,
  readFieldBilingualContent,
  readStepBilingualContent,
  type FieldBilingualContent,
  type StepBilingualContent,
} from './bilingual-types.js'
import { familyMemberDefinitionPath } from './family-repeater-paths.js'
import { admitFamilyRepeaterSchema } from './family-repeater-schema-admission.js'
import { readUiOrder } from './integrity.js'
import type { AuthoringUiState } from './reducer.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Nested member definition paths for one family-repeater root, in schema property order.
 */
function nestedMemberPathsForRoot(
  definition: FormDefinition,
  rootFieldId: string,
): readonly string[] {
  const provenance = definition.meta.paletteProvenance.find(
    (entry) => entry.fieldId === rootFieldId,
  )
  if (provenance?.widgetType !== 'family-repeater') {
    return []
  }
  const propertiesRoot = definition.jsonSchema['properties']
  if (!isPlainObject(propertiesRoot)) {
    return []
  }
  const admitted = admitFamilyRepeaterSchema(propertiesRoot[rootFieldId])
  if (!admitted.ok) {
    return []
  }
  return admitted.propertyKeys.map((propertyName) =>
    familyMemberDefinitionPath(rootFieldId, propertyName),
  )
}

/**
 * Visible bilingual draft state for completeness and the Bilingual workspace.
 * Uses shared field editor drafts when present; otherwise committed content.
 * Nested family-repeater member paths appear immediately after their root (FB-D16).
 */
export function collectVisibleBilingualDrafts(state: AuthoringUiState): {
  readonly fields: readonly FieldBilingualContent[]
  readonly steps: readonly StepBilingualContent[]
} {
  const definition = state.authoring.definition
  const order = readUiOrder(definition)
  const fields: FieldBilingualContent[] = []
  for (const fieldId of order) {
    fields.push(visibleFieldBilingual(state, definition, fieldId))
    for (const nestedPath of nestedMemberPathsForRoot(definition, fieldId)) {
      fields.push(visibleFieldBilingual(state, definition, nestedPath))
    }
  }
  const steps = definition.meta.progressiveSteps.map((step) => {
    const entry = state.stepEditorDrafts[step.stepId]
    if (entry) {
      return entry.draft
    }
    return readStepBilingualContent(definition, step.stepId)
  })
  return { fields, steps }
}

export function visibleFieldBilingual(
  state: AuthoringUiState,
  definition: FormDefinition,
  fieldId: string,
): FieldBilingualContent {
  const entry = state.editorDrafts[fieldId]
  if (entry) {
    return fieldBilingualFromParts(fieldId, entry.draft.widgetType, entry.draft, entry.errorDraft)
  }
  return readFieldBilingualContent(definition, fieldId)
}

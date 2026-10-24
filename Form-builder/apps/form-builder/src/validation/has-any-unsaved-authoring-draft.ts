import type { AuthoringUiState } from '../authoring/index.js'
import {
  isAnyBindingDraftDirty,
  isFieldAnyDraftDirty,
  isIntegrationBindingSurfaceDirty,
  isStepEditorDirty,
  isWorkflowBindingSurfaceDirty,
} from '../authoring/index.js'

/**
 * True when any visible authoring draft blocks server validation (FB-D6 / FB-D15 / FB-D21).
 * Covers dirty Property/Bilingual/Step/CAF/Integration/Workflow drafts, stale guidance
 * (via dirty selectors), and validation-visible incomplete drafts (showValidation).
 */
export function hasAnyUnsavedAuthoringDraft(uiState: AuthoringUiState): boolean {
  if (uiState.pendingConfiguredAdd !== null) {
    return true
  }
  if (uiState.pendingStructuralAdd !== null) {
    return true
  }
  for (const fieldId of Object.keys(uiState.editorDrafts)) {
    const entry = uiState.editorDrafts[fieldId]
    if (!entry) {
      continue
    }
    if (isFieldAnyDraftDirty(uiState, fieldId)) {
      return true
    }
    if (entry.propertyShowValidation || entry.bilingualShowValidation) {
      return true
    }
  }
  for (const stepId of Object.keys(uiState.stepEditorDrafts)) {
    const entry = uiState.stepEditorDrafts[stepId]
    if (!entry) {
      continue
    }
    if (isStepEditorDirty(uiState, stepId)) {
      return true
    }
    if (entry.showValidation) {
      return true
    }
  }
  // Covers binding content dirty, stale guidance, and showValidation (FB-D15).
  if (isAnyBindingDraftDirty(uiState.bindingDrafts)) {
    return true
  }
  if (
    isIntegrationBindingSurfaceDirty(uiState.integrationBindingDraft, uiState.authoring.definition)
  ) {
    return true
  }
  if (isWorkflowBindingSurfaceDirty(uiState.workflowBindingDraft, uiState.authoring.definition)) {
    return true
  }
  for (const fieldId of Object.keys(uiState.familyRepeaterDrafts)) {
    const entry = uiState.familyRepeaterDrafts[fieldId]
    if (!entry) {
      continue
    }
    if (isFieldAnyDraftDirty(uiState, fieldId)) {
      return true
    }
    if (entry.showValidation) {
      return true
    }
  }
  return false
}

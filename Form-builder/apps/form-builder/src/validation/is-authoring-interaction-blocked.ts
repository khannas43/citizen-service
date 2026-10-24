import { hasActiveCanvasReorderGesture, type AuthoringUiState } from '../authoring/index.js'
import { hasAnyUnsavedAuthoringDraft } from './has-any-unsaved-authoring-draft.js'

/** Blocks server/lifecycle operations while an editor draft or reorder gesture is active. */
export function isAuthoringInteractionBlocked(uiState: AuthoringUiState): boolean {
  return hasAnyUnsavedAuthoringDraft(uiState) || hasActiveCanvasReorderGesture(uiState)
}

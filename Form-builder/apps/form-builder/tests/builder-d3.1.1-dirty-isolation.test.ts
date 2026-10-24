import { describe, expect, it } from 'vitest'

import {
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  isFieldAnyDraftDirty,
  isFieldBilingualEditorDirty,
  isPropertyEditorDirty,
  isStepEditorDirty,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

describe('FB-D3.1.1 — dirty-state isolation', () => {
  it('after Property Apply with one-sided error draft: property clean, bilingual dirty, overall dirty', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId: 'applicant_name',
      patch: { errorEn: 'Only English error' },
    })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '77' },
    })
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId: 'applicant_name' })

    expect(isPropertyEditorDirty(ui, 'applicant_name')).toBe(false)
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(true)
    expect(isFieldAnyDraftDirty(ui, 'applicant_name')).toBe(true)
  })

  it('constraint-only draft dirties Property and overall, not Bilingual', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '55' },
    })
    expect(isPropertyEditorDirty(ui, 'applicant_name')).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(false)
    expect(isFieldAnyDraftDirty(ui, 'applicant_name')).toBe(true)
  })

  it('error-only draft dirties Bilingual and overall, not Property', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId: 'applicant_name',
      patch: { errorEn: 'Incomplete' },
    })
    expect(isPropertyEditorDirty(ui, 'applicant_name')).toBe(false)
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(true)
    expect(isFieldAnyDraftDirty(ui, 'applicant_name')).toBe(true)
  })

  it('shared label/help draft dirties both Property and Bilingual surfaces', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Shared dirty label' },
    })
    expect(isPropertyEditorDirty(ui, 'applicant_name')).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(true)
    expect(isFieldAnyDraftDirty(ui, 'applicant_name')).toBe(true)
  })

  it('property stale does not mark Bilingual dirty; bilingual stale does not mark Property dirty', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Seed' },
    })
    const entry = ui.editorDrafts.applicant_name!
    ui = {
      ...ui,
      editorDrafts: {
        ...ui.editorDrafts,
        applicant_name: {
          ...entry,
          draft: entry.baseline,
          propertyShowStaleGuidance: true,
          bilingualShowStaleGuidance: false,
        },
      },
    }
    expect(isPropertyEditorDirty(ui, 'applicant_name')).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(false)

    ui = {
      ...ui,
      editorDrafts: {
        ...ui.editorDrafts,
        applicant_name: {
          ...ui.editorDrafts.applicant_name!,
          propertyShowStaleGuidance: false,
          bilingualShowStaleGuidance: true,
        },
      },
    }
    expect(isPropertyEditorDirty(ui, 'applicant_name')).toBe(false)
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(true)
  })

  it('step dirty is independent of field property/bilingual dirty', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '12' },
    })
    expect(isStepEditorDirty(ui, 'identity')).toBe(false)
    ui = authoringReducer(ui, {
      type: 'patchStepEditorDraft',
      stepId: 'identity',
      patch: { labelEn: 'Step draft' },
    })
    expect(isStepEditorDirty(ui, 'identity')).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(false)
  })
})

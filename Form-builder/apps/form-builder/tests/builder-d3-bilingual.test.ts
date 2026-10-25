import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'

import {
  AuthoringError,
  addField,
  assertDefinitionIntegrity,
  authoringReducer,
  collectVisibleBilingualDrafts,
  computeBilingualCompleteness,
  createAuthoringSession,
  createAuthoringUiState,
  isFieldBilingualEditorDirty,
  isPropertyEditorDirty,
  isStepEditorDirty,
  moveField,
  readFieldBilingualContent,
  readFieldConfiguration,
  readStepBilingualContent,
  removeField,
  updateFieldBilingualContent,
  updateFieldConfiguration,
  updateStepBilingualContent,
  validateFieldBilingualDraft,
  validateStepBilingualDraft,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

function cloneDefinition(): FormDefinition {
  return structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION) as FormDefinition
}

describe('FB-D3 — field bilingual admission', () => {
  it('admits clean label pairs and optional blank help/error pairs', () => {
    const content = readFieldBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name')
    const result = validateFieldBilingualDraft({
      ...content,
      helpEn: '',
      helpGu: '',
      errorEn: '',
      errorGu: '',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects one-sided help and error pairs without repair', () => {
    const content = readFieldBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name')
    const help = validateFieldBilingualDraft({ ...content, helpEn: 'Only EN', helpGu: '' })
    expect(help.ok).toBe(false)
    if (help.ok) return
    expect(help.issues.some((issue) => issue.code === 'help_pair_incomplete')).toBe(true)

    const errors = validateFieldBilingualDraft({
      ...content,
      errorEn: '',
      errorGu: 'ફક્ત ગુજરાતી',
    })
    expect(errors.ok).toBe(false)
    if (errors.ok) return
    expect(errors.issues.some((issue) => issue.code === 'error_pair_incomplete')).toBe(true)
  })

  it('requires info-panel help in both languages', () => {
    const content = readFieldBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'info_guidance')
    const result = validateFieldBilingualDraft({ ...content, helpEn: '', helpGu: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((issue) => issue.code === 'help_required')).toBe(true)
  })

  it('rejects padded mandatory labels without trimming', () => {
    const content = readFieldBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name')
    const result = validateFieldBilingualDraft({ ...content, labelEn: ' Padded ' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((issue) => issue.code === 'label_en_padded')).toBe(true)
  })
})

describe('FB-D3 — step bilingual admission', () => {
  it('admits clean step label pairs', () => {
    const content = readStepBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'identity')
    expect(validateStepBilingualDraft(content).ok).toBe(true)
  })

  it('rejects blank or padded step labels', () => {
    const content = readStepBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'identity')
    const blank = validateStepBilingualDraft({ ...content, labelGu: '' })
    expect(blank.ok).toBe(false)
    if (blank.ok) return
    expect(blank.issues.some((issue) => issue.code === 'step_label_gu_required')).toBe(true)

    const padded = validateStepBilingualDraft({ ...content, labelEn: ' Identity ' })
    expect(padded.ok).toBe(false)
    if (padded.ok) return
    expect(padded.issues.some((issue) => issue.code === 'step_label_en_padded')).toBe(true)
  })
})

describe('FB-D3 — completeness', () => {
  it('counts required field labels, info-panel help, and step labels', () => {
    const fields = [
      {
        ...readFieldBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name'),
        helpEn: '',
        helpGu: '',
        errorEn: '',
        errorGu: '',
      },
      readFieldBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'info_guidance'),
    ]
    const steps = [
      readStepBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'identity'),
      readStepBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'household'),
    ]
    const meter = computeBilingualCompleteness(fields, steps)
    // 2 field labels + 1 info help + 2 step labels = 5 required/active when optionals blank
    expect(meter.requiredPairs).toBe(5)
    expect(meter.activePairs).toBe(5)
    expect(meter.completePairs).toBe(5)
    expect(meter.percentage).toBe(100)
  })

  it('ignores blank optional pairs and marks one-sided optionals incomplete', () => {
    const field = {
      ...readFieldBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name'),
      helpEn: 'Only EN help',
      helpGu: '',
      errorEn: '',
      errorGu: '',
    }
    const meter = computeBilingualCompleteness(
      [field],
      [readStepBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'identity')],
    )
    expect(meter.requiredPairs).toBe(2)
    expect(meter.activePairs).toBe(3)
    expect(meter.completePairs).toBe(2)
    expect(meter.percentage).toBe(67)
  })

  it('includes complete optional error pairs in the active total', () => {
    const field = {
      ...readFieldBilingualContent(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name'),
      helpEn: '',
      helpGu: '',
      errorEn: 'Required',
      errorGu: 'જરૂરી',
    }
    const meter = computeBilingualCompleteness([field], [])
    expect(meter.activePairs).toBe(2)
    expect(meter.completePairs).toBe(2)
    expect(meter.percentage).toBe(100)
  })
})

describe('FB-D3 — update contracts preserve unrelated state', () => {
  it('updates field bilingual content and preserves schema, preview, and other fields', () => {
    const state = createAuthoringSession(cloneDefinition())
    const previewBefore = { ...state.previewFormData }
    const beforeSchema = structuredClone(state.definition.jsonSchema)
    const baseline = readFieldBilingualContent(state.definition, 'applicant_name')
    const next = {
      ...baseline,
      labelEn: 'Updated applicant name',
      labelGu: 'અપડેટ અરજદાર નામ',
      errorEn: 'Enter your name',
      errorGu: 'તમારું નામ દાખલ કરો',
    }
    const result = updateFieldBilingualContent(state, 'applicant_name', next, baseline)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.definition.meta.bilingual.labels.applicant_name).toEqual({
      en: 'Updated applicant name',
      gu: 'અપડેટ અરજદાર નામ',
    })
    expect(result.state.definition.meta.bilingual.errors.applicant_name).toEqual({
      en: 'Enter your name',
      gu: 'તમારું નામ દાખલ કરો',
    })
    expect(result.state.definition.jsonSchema).toEqual(beforeSchema)
    expect(result.state.previewFormData).toEqual(previewBefore)
    expect(result.state.definition.meta.bilingual.labels.gender).toEqual(
      state.definition.meta.bilingual.labels.gender,
    )
    assertDefinitionIntegrity(result.state.definition)
  })

  it('updates step labels without mutating field bilingual or preview', () => {
    const state = createAuthoringSession(cloneDefinition())
    const previewBefore = { ...state.previewFormData }
    const labelsBefore = structuredClone(state.definition.meta.bilingual.labels)
    const baseline = readStepBilingualContent(state.definition, 'identity')
    const result = updateStepBilingualContent(
      state,
      'identity',
      { ...baseline, labelEn: 'Identity details', labelGu: 'ઓળખ વિગતો' },
      baseline,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.definition.meta.progressiveSteps[0]?.labelEn).toBe('Identity details')
    expect(result.state.definition.meta.progressiveSteps[0]?.labelGu).toBe('ઓળખ વિગતો')
    expect(result.state.definition.meta.bilingual.labels).toEqual(labelsBefore)
    expect(result.state.previewFormData).toEqual(previewBefore)
  })
})

describe('FB-D3 — shared drafts and constraint survival', () => {
  it('shares label/help drafts between Property Inspector patches and Bilingual', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Shared draft label', helpGu: 'સહાય' },
    })
    const visible = collectVisibleBilingualDrafts(ui).fields.find(
      (field) => field.fieldId === 'applicant_name',
    )
    expect(visible?.labelEn).toBe('Shared draft label')
    expect(visible?.helpGu).toBe('સહાય')
  })

  it('keeps unsaved maxLength draft after bilingual Apply', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '55', labelEn: 'Bilingual applied name' },
    })
    expect(ui.editorDrafts.applicant_name?.draft.maxLength).toBe('55')
    ui = authoringReducer(ui, { type: 'applyFieldBilingual', fieldId: 'applicant_name' })
    expect(ui.authoring.definition.meta.bilingual.labels.applicant_name?.en).toBe(
      'Bilingual applied name',
    )
    expect(ui.editorDrafts.applicant_name?.draft.maxLength).toBe('55')
    expect(ui.editorDrafts.applicant_name?.baseline.maxLength).not.toBe('55')
    expect(isPropertyEditorDirty(ui, 'applicant_name')).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(false)
    const schema = ui.authoring.definition.jsonSchema.properties as Record<
      string,
      Record<string, unknown>
    >
    expect(schema.applicant_name?.maxLength).not.toBe(55)
  })

  it('does not let bilingual Apply discard or apply unrelated constraint drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '12', labelGu: 'નવું નામ' },
    })
    const beforePreview = { ...ui.authoring.previewFormData }
    ui = authoringReducer(ui, { type: 'applyFieldBilingual', fieldId: 'applicant_name' })
    expect(ui.authoring.previewFormData).toEqual(beforePreview)
    expect(ui.editorDrafts.applicant_name?.draft.maxLength).toBe('12')
  })
})

describe('FB-D3 — field Apply / Cancel and stale baselines', () => {
  it('Cancel reloads committed bilingual without clearing constraint drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Temp', maxLength: '77' },
    })
    ui = authoringReducer(ui, { type: 'cancelFieldBilingual', fieldId: 'applicant_name' })
    expect(ui.editorDrafts.applicant_name?.draft.labelEn).toBe('Applicant full name')
    expect(ui.editorDrafts.applicant_name?.draft.maxLength).toBe('77')
  })

  it('returns stale_editor_draft when committed bilingual diverged', () => {
    const state = createAuthoringSession(cloneDefinition())
    const baseline = readFieldBilingualContent(state.definition, 'applicant_name')
    const concurrent = updateFieldBilingualContent(
      state,
      'applicant_name',
      { ...baseline, labelEn: 'Other commit' },
      baseline,
    )
    expect(concurrent.ok).toBe(true)
    if (!concurrent.ok) return

    const stale = updateFieldBilingualContent(
      concurrent.state,
      'applicant_name',
      { ...baseline, labelEn: 'Stale draft' },
      baseline,
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error).toBeInstanceOf(AuthoringError)
    expect(stale.error.code).toBe('stale_editor_draft')
  })

  it('reducer retains bilingual draft on stale Apply and Cancel rebases', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'My draft label' },
    })
    const baseline = ui.editorDrafts.applicant_name!.baseline
    const concurrent = updateFieldConfiguration(
      ui.authoring,
      'applicant_name',
      {
        ...readFieldConfiguration(ui.authoring.definition, 'applicant_name'),
        labelEn: 'Other commit',
      },
      readFieldConfiguration(ui.authoring.definition, 'applicant_name'),
    )
    expect(concurrent.ok).toBe(true)
    if (!concurrent.ok) return
    ui = {
      ...ui,
      authoring: concurrent.state,
      editorDrafts: {
        ...ui.editorDrafts,
        applicant_name: {
          ...ui.editorDrafts.applicant_name!,
          draft: ui.editorDrafts.applicant_name!.draft,
          baseline,
          propertyShowValidation: false,
          propertyShowStaleGuidance: false,
          bilingualShowValidation: false,
          bilingualShowStaleGuidance: false,
        },
      },
    }
    ui = authoringReducer(ui, { type: 'applyFieldBilingual', fieldId: 'applicant_name' })
    expect(ui.editorDrafts.applicant_name?.bilingualShowStaleGuidance).toBe(true)
    expect(ui.editorDrafts.applicant_name?.draft.labelEn).toBe('My draft label')
    ui = authoringReducer(ui, { type: 'cancelFieldBilingual', fieldId: 'applicant_name' })
    expect(ui.editorDrafts.applicant_name?.draft.labelEn).toBe('Other commit')
    expect(ui.editorDrafts.applicant_name?.bilingualShowStaleGuidance).toBe(false)
  })

  it('does not false-stale from add, reorder, selection, or unrelated Apply', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Still mine' },
    })
    ui = authoringReducer(ui, { type: 'add', widgetType: 'text-short' })
    ui = authoringReducer(ui, { type: 'select', fieldId: 'gender' })
    ui = authoringReducer(ui, { type: 'move', fieldId: 'gender', direction: 'down' })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'gender',
      patch: { labelEn: 'Gender renamed' },
    })
    ui = authoringReducer(ui, { type: 'applyFieldBilingual', fieldId: 'gender' })
    expect(ui.editorDrafts.applicant_name?.draft.labelEn).toBe('Still mine')
    expect(ui.editorDrafts.applicant_name?.bilingualShowStaleGuidance).toBeFalsy()
    ui = authoringReducer(ui, { type: 'applyFieldBilingual', fieldId: 'applicant_name' })
    expect(ui.editorDrafts.applicant_name?.bilingualShowStaleGuidance).toBe(false)
    expect(ui.authoring.definition.meta.bilingual.labels.applicant_name?.en).toBe('Still mine')
  })
})

describe('FB-D3 — step Apply / Cancel and stale', () => {
  it('applies and cancels step label drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchStepEditorDraft',
      stepId: 'identity',
      patch: { labelEn: 'Identity step draft' },
    })
    expect(isStepEditorDirty(ui, 'identity')).toBe(true)
    expect(ui.authoring.definition.meta.progressiveSteps[0]?.labelEn).toBe('Identity')
    ui = authoringReducer(ui, { type: 'applyStepBilingual', stepId: 'identity' })
    expect(ui.authoring.definition.meta.progressiveSteps[0]?.labelEn).toBe('Identity step draft')
    expect(isStepEditorDirty(ui, 'identity')).toBe(false)

    ui = authoringReducer(ui, {
      type: 'patchStepEditorDraft',
      stepId: 'identity',
      patch: { labelEn: 'Temp cancel' },
    })
    ui = authoringReducer(ui, { type: 'cancelStepBilingual', stepId: 'identity' })
    expect(ui.stepEditorDrafts.identity?.draft.labelEn).toBe('Identity step draft')
  })

  it('stales step drafts when committed step labels change', () => {
    const state = createAuthoringSession(cloneDefinition())
    const baseline = readStepBilingualContent(state.definition, 'identity')
    const concurrent = updateStepBilingualContent(
      state,
      'identity',
      { ...baseline, labelEn: 'Committed elsewhere' },
      baseline,
    )
    expect(concurrent.ok).toBe(true)
    if (!concurrent.ok) return
    const stale = updateStepBilingualContent(
      concurrent.state,
      'identity',
      { ...baseline, labelEn: 'Stale step' },
      baseline,
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_editor_draft')
  })
})

describe('FB-D3 — add appearance and remove cleanup', () => {
  it('removes field draft state on remove and shows new fields in bilingual drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Temp' },
    })
    expect(ui.editorDrafts.applicant_name).toBeDefined()

    const added = addField(ui.authoring, 'yesno')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    ui = { ...ui, authoring: added.state }
    const newId = added.state.selectedFieldId
    expect(newId).toBeTruthy()
    const visible = collectVisibleBilingualDrafts(ui).fields.map((field) => field.fieldId)
    expect(visible).toContain(newId)

    const removed = removeField(ui.authoring, 'applicant_name')
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    ui = authoringReducer(
      { ...ui, authoring: removed.state },
      { type: 'remove', fieldId: 'applicant_name' },
    )
    // applicant_name already removed from authoring; ensure drafts map has no leftover
    ui = createAuthoringUiState(removed.state)
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: newId!,
      patch: { labelEn: 'Keep' },
    })
    ui = authoringReducer(ui, { type: 'remove', fieldId: newId! })
    expect(ui.editorDrafts[newId!]).toBeUndefined()
  })

  it('moveField does not clear bilingual drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Kept through move' },
    })
    const moved = moveField(ui.authoring, 'applicant_name', 'down')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    ui = { ...ui, authoring: moved.state }
    expect(ui.editorDrafts.applicant_name?.draft.labelEn).toBe('Kept through move')
  })
})

describe('FB-D3 — completeness from visible draft state', () => {
  it('reflects incomplete unsaved bilingual work in the meter', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelGu: '' },
    })
    const { fields, steps } = collectVisibleBilingualDrafts(ui)
    const meter = computeBilingualCompleteness(fields, steps)
    expect(meter.completePairs).toBeLessThan(meter.activePairs)
    expect(meter.percentage).toBeLessThan(100)
  })
})

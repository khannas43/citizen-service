import { describe, expect, it } from 'vitest'

import {
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  isFieldAnyDraftDirty,
  isFieldBilingualEditorDirty,
  readFieldConfiguration,
  updateFieldBilingualContent,
  updateFieldConfiguration,
  validateFieldConfigurationDraft,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

describe('FB-D3.1 — cross-editor isolation', () => {
  it('one-sided Bilingual error draft does not block Property constraint Apply', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId: 'applicant_name',
      patch: { errorEn: 'Only English error' },
    })
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(true)

    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '88' },
    })
    const propertyValidation = validateFieldConfigurationDraft(
      ui.editorDrafts.applicant_name!.draft,
    )
    expect(propertyValidation.ok).toBe(true)

    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId: 'applicant_name' })
    expect(ui.editorDrafts.applicant_name?.propertyShowValidation).toBe(false)
    const schema = ui.authoring.definition.jsonSchema.properties as Record<
      string,
      Record<string, unknown>
    >
    expect(schema.applicant_name?.maxLength).toBe(88)
    expect(ui.editorDrafts.applicant_name?.errorDraft).toEqual({
      en: 'Only English error',
      gu: '',
    })
    expect(isFieldBilingualEditorDirty(ui, 'applicant_name')).toBe(true)
  })

  it('Property Apply preserves committed meta.bilingual.errors exactly', () => {
    let session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const bilingualBaseline = {
      fieldId: 'applicant_name',
      widgetType: 'text-short',
      labelEn: 'Applicant full name',
      labelGu: 'અરજદારનું પૂરું નામ',
      helpEn: session.definition.meta.bilingual.help.applicant_name!.en,
      helpGu: session.definition.meta.bilingual.help.applicant_name!.gu,
      errorEn: 'Committed EN',
      errorGu: 'સમર્પિત GU',
    }
    const seeded = updateFieldBilingualContent(session, 'applicant_name', bilingualBaseline, {
      ...bilingualBaseline,
      errorEn: '',
      errorGu: '',
    })
    expect(seeded.ok).toBe(true)
    if (!seeded.ok) return
    session = seeded.state

    let ui = createAuthoringUiState(session)
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '61' },
    })
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId: 'applicant_name' })
    expect(ui.authoring.definition.meta.bilingual.errors.applicant_name).toEqual({
      en: 'Committed EN',
      gu: 'સમર્પિત GU',
    })
  })

  it('Bilingual Apply does not clear visible Property validation state', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '0' },
    })
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId: 'applicant_name' })
    expect(ui.editorDrafts.applicant_name?.propertyShowValidation).toBe(true)

    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Bilingual label only' },
    })
    ui = authoringReducer(ui, { type: 'applyFieldBilingual', fieldId: 'applicant_name' })
    expect(ui.authoring.definition.meta.bilingual.labels.applicant_name?.en).toBe(
      'Bilingual label only',
    )
    expect(ui.editorDrafts.applicant_name?.propertyShowValidation).toBe(true)
    expect(ui.editorDrafts.applicant_name?.draft.maxLength).toBe('0')
  })

  it('Property Apply does not clear visible Bilingual validation state', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId: 'applicant_name',
      patch: { errorEn: 'Incomplete' },
    })
    ui = authoringReducer(ui, { type: 'applyFieldBilingual', fieldId: 'applicant_name' })
    expect(ui.editorDrafts.applicant_name?.bilingualShowValidation).toBe(true)
    expect(ui.pendingFocusEditorControl).toBe('field:applicant_name:errorGu')

    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '42' },
    })
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId: 'applicant_name' })
    expect(
      (ui.authoring.definition.jsonSchema.properties as Record<string, Record<string, unknown>>)
        .applicant_name?.maxLength,
    ).toBe(42)
    expect(ui.editorDrafts.applicant_name?.bilingualShowValidation).toBe(true)
    expect(ui.editorDrafts.applicant_name?.errorDraft).toEqual({
      en: 'Incomplete',
      gu: '',
    })
  })

  it('Property Cancel preserves error drafts; Bilingual Cancel preserves constraints', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId: 'applicant_name',
      patch: { errorEn: 'Keep me' },
    })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '33', labelEn: 'Temp property label' },
    })
    ui = authoringReducer(ui, { type: 'cancelEditorDraft', fieldId: 'applicant_name' })
    expect(ui.editorDrafts.applicant_name?.draft.labelEn).toBe('Applicant full name')
    expect(ui.editorDrafts.applicant_name?.errorDraft).toEqual({ en: 'Keep me', gu: '' })

    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '44' },
    })
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Temp bilingual label' },
    })
    ui = authoringReducer(ui, { type: 'cancelFieldBilingual', fieldId: 'applicant_name' })
    expect(ui.editorDrafts.applicant_name?.draft.labelEn).toBe('Applicant full name')
    expect(ui.editorDrafts.applicant_name?.draft.maxLength).toBe('44')
    expect(ui.editorDrafts.applicant_name?.errorDraft).toEqual({ en: '', gu: '' })
    expect(isFieldAnyDraftDirty(ui, 'applicant_name')).toBe(true)
  })

  it('patchEditorDraft cannot alter error drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { errorEn: 'Should be ignored', errorGu: 'ignore' },
    })
    expect(ui.editorDrafts.applicant_name?.errorDraft).toEqual({ en: '', gu: '' })
    expect(
      'errorEn' in (ui.editorDrafts.applicant_name!.draft as unknown as Record<string, unknown>),
    ).toBe(false)
  })

  it('Property Apply never removes or invents bilingual errors via updateFieldConfiguration', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const withErrors = {
      ...state,
      definition: {
        ...state.definition,
        meta: {
          ...state.definition.meta,
          bilingual: {
            ...state.definition.meta.bilingual,
            errors: {
              applicant_name: { en: 'Keep', gu: 'રાખો' },
            },
          },
        },
      },
    }
    const result = updateFieldConfiguration(
      withErrors,
      'applicant_name',
      { ...committed, maxLength: '50' },
      committed,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.definition.meta.bilingual.errors.applicant_name).toEqual({
      en: 'Keep',
      gu: 'રાખો',
    })
  })
})

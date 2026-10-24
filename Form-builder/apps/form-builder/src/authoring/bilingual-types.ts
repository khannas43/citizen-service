import type { FormDefinition } from '@dg20/form-contract'

import { AuthoringError } from './types.js'
import { readUiOrder } from './integrity.js'

/** Governed bilingual content for one field (FB-D3). */
export interface FieldBilingualContent {
  readonly fieldId: string
  readonly widgetType: string
  readonly labelEn: string
  readonly labelGu: string
  readonly helpEn: string
  readonly helpGu: string
  readonly errorEn: string
  readonly errorGu: string
}

/** Governed bilingual content for one progressive step (FB-D3). */
export interface StepBilingualContent {
  readonly stepId: string
  readonly labelEn: string
  readonly labelGu: string
}

/** Optional bilingual error-message pair (FB-D3.1 — Bilingual surface only). */
export interface BilingualErrorPair {
  readonly en: string
  readonly gu: string
}

/** Exact typed patch for the Bilingual field workspace (FB-D3.1). */
export type BilingualFieldPatch = Readonly<{
  labelEn?: string
  labelGu?: string
  helpEn?: string
  helpGu?: string
  errorEn?: string
  errorGu?: string
}>

export type FieldBilingualDraft = FieldBilingualContent
export type StepBilingualDraft = StepBilingualContent

export type BilingualIssueCode =
  | 'label_en_required'
  | 'label_gu_required'
  | 'label_en_padded'
  | 'label_gu_padded'
  | 'help_pair_incomplete'
  | 'help_en_padded'
  | 'help_gu_padded'
  | 'help_required'
  | 'error_pair_incomplete'
  | 'error_en_padded'
  | 'error_gu_padded'
  | 'step_label_en_required'
  | 'step_label_gu_required'
  | 'step_label_en_padded'
  | 'step_label_gu_padded'

export interface BilingualIssue {
  readonly code: BilingualIssueCode
  readonly control: string
}

export type FieldBilingualValidationResult =
  | { readonly ok: true; readonly content: FieldBilingualContent }
  | { readonly ok: false; readonly issues: readonly BilingualIssue[] }

export type StepBilingualValidationResult =
  | { readonly ok: true; readonly content: StepBilingualContent }
  | { readonly ok: false; readonly issues: readonly BilingualIssue[] }

export interface BilingualCompletenessPair {
  readonly id: string
  readonly kind: 'field_label' | 'field_help' | 'field_error' | 'step_label'
  readonly required: boolean
  readonly complete: boolean
  readonly active: boolean
}

export interface BilingualCompleteness {
  readonly completePairs: number
  readonly activePairs: number
  readonly requiredPairs: number
  readonly percentage: number
  readonly pairs: readonly BilingualCompletenessPair[]
}

function readPair(
  bucket: Readonly<Record<string, { en: string; gu: string }>> | undefined,
  fieldId: string,
): { en: string; gu: string } {
  const pair = bucket?.[fieldId]
  if (!pair) {
    return { en: '', gu: '' }
  }
  return { en: pair.en, gu: pair.gu }
}

export function readFieldBilingualContent(
  definition: FormDefinition,
  fieldId: string,
): FieldBilingualContent {
  const provenance = definition.meta.paletteProvenance.find((entry) => entry.fieldId === fieldId)
  if (!provenance) {
    throw new AuthoringError('field_not_found', `Field not found in provenance: ${fieldId}`)
  }
  const label = definition.meta.bilingual.labels[fieldId]
  if (!label) {
    throw new AuthoringError('inconsistent_definition', 'Field is missing bilingual labels')
  }
  const help = readPair(definition.meta.bilingual.help, fieldId)
  const errors = readPair(definition.meta.bilingual.errors, fieldId)
  return {
    fieldId,
    widgetType: provenance.widgetType,
    labelEn: label.en,
    labelGu: label.gu,
    helpEn: help.en,
    helpGu: help.gu,
    errorEn: errors.en,
    errorGu: errors.gu,
  }
}

export function readAllFieldBilingualContent(
  definition: FormDefinition,
): readonly FieldBilingualContent[] {
  const order = readUiOrder(definition)
  return order.map((fieldId) => readFieldBilingualContent(definition, fieldId))
}

export function readStepBilingualContent(
  definition: FormDefinition,
  stepId: string,
): StepBilingualContent {
  const step = definition.meta.progressiveSteps.find((entry) => entry.stepId === stepId)
  if (!step) {
    throw new AuthoringError('field_not_found', `Progressive step not found: ${stepId}`)
  }
  return {
    stepId: step.stepId,
    labelEn: step.labelEn,
    labelGu: step.labelGu,
  }
}

export function readAllStepBilingualContent(
  definition: FormDefinition,
): readonly StepBilingualContent[] {
  return definition.meta.progressiveSteps.map((step) => ({
    stepId: step.stepId,
    labelEn: step.labelEn,
    labelGu: step.labelGu,
  }))
}

export function fieldBilingualFromParts(
  fieldId: string,
  widgetType: string,
  strings: {
    readonly labelEn: string
    readonly labelGu: string
    readonly helpEn: string
    readonly helpGu: string
  },
  errors: BilingualErrorPair,
): FieldBilingualContent {
  return {
    fieldId,
    widgetType,
    labelEn: strings.labelEn,
    labelGu: strings.labelGu,
    helpEn: strings.helpEn,
    helpGu: strings.helpGu,
    errorEn: errors.en,
    errorGu: errors.gu,
  }
}

/** @deprecated Prefer {@link fieldBilingualFromParts} — kept for call-site migration. */
export function fieldBilingualFromConfiguration(
  fieldId: string,
  widgetType: string,
  config: {
    readonly labelEn: string
    readonly labelGu: string
    readonly helpEn: string
    readonly helpGu: string
  },
  errors: BilingualErrorPair = { en: '', gu: '' },
): FieldBilingualContent {
  return fieldBilingualFromParts(fieldId, widgetType, config, errors)
}

export function isFieldBilingualDirty(
  committed: FieldBilingualContent,
  draft: FieldBilingualDraft,
): boolean {
  return (
    committed.labelEn !== draft.labelEn ||
    committed.labelGu !== draft.labelGu ||
    committed.helpEn !== draft.helpEn ||
    committed.helpGu !== draft.helpGu ||
    committed.errorEn !== draft.errorEn ||
    committed.errorGu !== draft.errorGu ||
    committed.widgetType !== draft.widgetType ||
    committed.fieldId !== draft.fieldId
  )
}

export function isStepBilingualDirty(
  committed: StepBilingualContent,
  draft: StepBilingualDraft,
): boolean {
  return (
    committed.stepId !== draft.stepId ||
    committed.labelEn !== draft.labelEn ||
    committed.labelGu !== draft.labelGu
  )
}

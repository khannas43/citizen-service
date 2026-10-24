import type {
  BilingualIssue,
  FieldBilingualContent,
  FieldBilingualDraft,
  FieldBilingualValidationResult,
  StepBilingualContent,
  StepBilingualDraft,
  StepBilingualValidationResult,
} from './bilingual-types.js'

function hasText(value: string): boolean {
  return value.length > 0
}

function isPadded(value: string): boolean {
  return value.length > 0 && value.trim() !== value
}

function isCleanNonblank(value: string): boolean {
  return hasText(value) && !isPadded(value)
}

/**
 * Validate field bilingual draft. Mandatory labels; optional help/error pairs
 * (both blank removes; one-sided invalid). Info-panel and eligibility-declaration
 * help are mandatory.
 */
export function validateFieldBilingualDraft(
  draft: FieldBilingualDraft,
): FieldBilingualValidationResult {
  const issues: BilingualIssue[] = []

  if (!hasText(draft.labelEn)) {
    issues.push({ code: 'label_en_required', control: 'labelEn' })
  } else if (isPadded(draft.labelEn)) {
    issues.push({ code: 'label_en_padded', control: 'labelEn' })
  }

  if (!hasText(draft.labelGu)) {
    issues.push({ code: 'label_gu_required', control: 'labelGu' })
  } else if (isPadded(draft.labelGu)) {
    issues.push({ code: 'label_gu_padded', control: 'labelGu' })
  }

  const helpEnBlank = !hasText(draft.helpEn)
  const helpGuBlank = !hasText(draft.helpGu)
  const helpRequired =
    draft.widgetType === 'info-panel' || draft.widgetType === 'eligibility-declaration'

  if (helpRequired) {
    if (helpEnBlank) {
      issues.push({ code: 'help_required', control: 'helpEn' })
    } else if (isPadded(draft.helpEn)) {
      issues.push({ code: 'help_en_padded', control: 'helpEn' })
    }
    if (helpGuBlank) {
      issues.push({ code: 'help_required', control: 'helpGu' })
    } else if (isPadded(draft.helpGu)) {
      issues.push({ code: 'help_gu_padded', control: 'helpGu' })
    }
  } else if (helpEnBlank !== helpGuBlank) {
    issues.push({
      code: 'help_pair_incomplete',
      control: helpEnBlank ? 'helpEn' : 'helpGu',
    })
  } else if (!helpEnBlank && isPadded(draft.helpEn)) {
    issues.push({ code: 'help_en_padded', control: 'helpEn' })
  } else if (!helpGuBlank && isPadded(draft.helpGu)) {
    issues.push({ code: 'help_gu_padded', control: 'helpGu' })
  }

  const errorEnBlank = !hasText(draft.errorEn)
  const errorGuBlank = !hasText(draft.errorGu)
  if (errorEnBlank !== errorGuBlank) {
    issues.push({
      code: 'error_pair_incomplete',
      control: errorEnBlank ? 'errorEn' : 'errorGu',
    })
  } else if (!errorEnBlank && isPadded(draft.errorEn)) {
    issues.push({ code: 'error_en_padded', control: 'errorEn' })
  } else if (!errorGuBlank && isPadded(draft.errorGu)) {
    issues.push({ code: 'error_gu_padded', control: 'errorGu' })
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const content: FieldBilingualContent = {
    fieldId: draft.fieldId,
    widgetType: draft.widgetType,
    labelEn: draft.labelEn,
    labelGu: draft.labelGu,
    helpEn: draft.helpEn,
    helpGu: draft.helpGu,
    errorEn: draft.errorEn,
    errorGu: draft.errorGu,
  }

  // Defensive: ensure admitted content meets clean rules used by completeness.
  if (
    !isCleanNonblank(content.labelEn) ||
    !isCleanNonblank(content.labelGu) ||
    (helpRequired && (!isCleanNonblank(content.helpEn) || !isCleanNonblank(content.helpGu)))
  ) {
    return {
      ok: false,
      issues: [{ code: 'label_en_required', control: 'labelEn' }],
    }
  }

  return { ok: true, content }
}

export function validateStepBilingualDraft(
  draft: StepBilingualDraft,
): StepBilingualValidationResult {
  const issues: BilingualIssue[] = []

  if (!hasText(draft.labelEn)) {
    issues.push({ code: 'step_label_en_required', control: 'labelEn' })
  } else if (isPadded(draft.labelEn)) {
    issues.push({ code: 'step_label_en_padded', control: 'labelEn' })
  }

  if (!hasText(draft.labelGu)) {
    issues.push({ code: 'step_label_gu_required', control: 'labelGu' })
  } else if (isPadded(draft.labelGu)) {
    issues.push({ code: 'step_label_gu_padded', control: 'labelGu' })
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const content: StepBilingualContent = {
    stepId: draft.stepId,
    labelEn: draft.labelEn,
    labelGu: draft.labelGu,
  }
  return { ok: true, content }
}

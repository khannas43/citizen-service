import type {
  BilingualCompleteness,
  BilingualCompletenessPair,
  FieldBilingualContent,
  StepBilingualContent,
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

function pairStatus(
  en: string,
  gu: string,
): { readonly present: boolean; readonly complete: boolean } {
  const enBlank = !hasText(en)
  const guBlank = !hasText(gu)
  if (enBlank && guBlank) {
    return { present: false, complete: false }
  }
  if (enBlank !== guBlank) {
    return { present: true, complete: false }
  }
  return {
    present: true,
    complete: isCleanNonblank(en) && isCleanNonblank(gu),
  }
}

/**
 * Deterministic bilingual completeness from visible draft state.
 *
 * Required pairs:
 * - one label pair per field
 * - info-panel / eligibility-declaration help pair
 * - one label pair per progressive step
 *
 * Optional help/error pairs:
 * - ignored when both blank
 * - active+incomplete when one-sided
 * - active+complete when both clean/nonblank
 */
export function computeBilingualCompleteness(
  fields: readonly FieldBilingualContent[],
  steps: readonly StepBilingualContent[],
): BilingualCompleteness {
  const pairs: BilingualCompletenessPair[] = []

  for (const field of fields) {
    const label = pairStatus(field.labelEn, field.labelGu)
    pairs.push({
      id: `${field.fieldId}:label`,
      kind: 'field_label',
      required: true,
      active: true,
      complete: label.complete,
    })

    const help = pairStatus(field.helpEn, field.helpGu)
    const helpRequired =
      field.widgetType === 'info-panel' || field.widgetType === 'eligibility-declaration'
    if (helpRequired) {
      pairs.push({
        id: `${field.fieldId}:help`,
        kind: 'field_help',
        required: true,
        active: true,
        complete: help.complete,
      })
    } else if (help.present) {
      pairs.push({
        id: `${field.fieldId}:help`,
        kind: 'field_help',
        required: false,
        active: true,
        complete: help.complete,
      })
    }

    const error = pairStatus(field.errorEn, field.errorGu)
    if (error.present) {
      pairs.push({
        id: `${field.fieldId}:error`,
        kind: 'field_error',
        required: false,
        active: true,
        complete: error.complete,
      })
    }
  }

  for (const step of steps) {
    const label = pairStatus(step.labelEn, step.labelGu)
    pairs.push({
      id: `${step.stepId}:label`,
      kind: 'step_label',
      required: true,
      active: true,
      complete: label.complete,
    })
  }

  const activePairs = pairs.filter((pair) => pair.active)
  const completePairs = activePairs.filter((pair) => pair.complete).length
  const requiredPairs = pairs.filter((pair) => pair.required).length
  const activeCount = activePairs.length
  const percentage = activeCount === 0 ? 100 : Math.round((completePairs / activeCount) * 100)

  return {
    completePairs,
    activePairs: activeCount,
    requiredPairs,
    percentage,
    pairs,
  }
}

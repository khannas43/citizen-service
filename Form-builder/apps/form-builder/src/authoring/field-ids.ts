import type { FormDefinition } from '@dg20/form-contract'

/**
 * Deterministic field IDs from widgetType:
 * ASCII lowercase snake_case + lowest available positive suffix.
 * Example: text-short → text_short_1, text_short_2
 *
 * Scans the current definition only — no module-global counters.
 */
export function widgetTypeToIdStem(widgetType: string): string {
  return widgetType
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function collectExistingFieldIds(definition: FormDefinition): ReadonlySet<string> {
  const properties = definition.jsonSchema['properties']
  const ids = new Set<string>()
  if (properties !== null && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const key of Object.keys(properties as Record<string, unknown>)) {
      ids.add(key)
    }
  }
  return ids
}

export function allocateFieldId(definition: FormDefinition, widgetType: string): string {
  const stem = widgetTypeToIdStem(widgetType)
  if (stem.length === 0) {
    throw new Error(`Cannot derive field-id stem from widgetType: ${widgetType}`)
  }
  const existing = collectExistingFieldIds(definition)
  let suffix = 1
  while (existing.has(`${stem}_${suffix}`)) {
    suffix += 1
  }
  return `${stem}_${suffix}`
}

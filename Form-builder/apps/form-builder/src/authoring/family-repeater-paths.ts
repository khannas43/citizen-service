/**
 * Canonical family-repeater nested path helpers (FB-D16).
 * Uses B3 FieldPathEscaper-compatible client helpers — never re-escape resolved paths.
 */

import { appendArrayTemplate, appendProperty, escapeFieldPathSegment } from '@citizen/form-widgets'

import { widgetTypeToIdStem } from './field-ids.js'

/**
 * Definition / provenance / bilingual path for a member under a root repeater.
 * Example: `family_members` + `member_name` → `family_members[].member_name`
 */
export function familyMemberDefinitionPath(
  repeaterFieldId: string,
  memberPropertyName: string,
): string {
  return appendProperty(appendArrayTemplate(null, repeaterFieldId), memberPropertyName)
}

/**
 * True when `path` is the repeater template path or a direct nested descendant
 * under this repeater only — no prefix collision (`family` vs `family_other`).
 */
export function isDescendantOfRepeater(path: string, repeaterFieldId: string): boolean {
  const escaped = escapeFieldPathSegment(repeaterFieldId)
  const template = `${escaped}[]`
  return path === template || path.startsWith(`${template}.`)
}

/**
 * True when `path` is a nested member under the repeater (not the template alone).
 * Used by remove-field descendant scrubbing.
 */
export function isRepeaterDescendantPath(path: string, rootFieldId: string): boolean {
  const prefix = `${escapeFieldPathSegment(rootFieldId)}[].`
  return path.startsWith(prefix)
}

/**
 * Allocate a deterministic member property id within `items.properties` only.
 * Example: `text-short` → `text_short_1`
 */
export function allocateMemberPropertyId(
  existingMemberIds: ReadonlySet<string>,
  widgetType: string,
): string {
  const stem = widgetTypeToIdStem(widgetType)
  if (stem.length === 0) {
    throw new Error(`Cannot derive member property id stem from widgetType: ${widgetType}`)
  }
  let suffix = 1
  while (existingMemberIds.has(`${stem}_${suffix}`)) {
    suffix += 1
  }
  return `${stem}_${suffix}`
}

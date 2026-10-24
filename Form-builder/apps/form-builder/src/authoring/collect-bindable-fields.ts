/**
 * Governed bindable-field graph for Integration/Workflow authoring (FB-D21).
 * Roots follow ui:order; nested family members follow immediately after their parent.
 */

import type { FormDefinition } from '@dg20/form-contract'
import { getPaletteWidget } from '@dg20/form-widgets'

import { collectFamilyRepeaterNestedPaths } from './family-repeater-schema-admission.js'
import { assertDefinitionIntegrity, readUiOrder } from './integrity.js'

export type BindableFieldKind = 'root' | 'nested'

export type BindableField = {
  readonly fieldId: string
  readonly widgetType: string
  readonly labelEn: string
  readonly labelGu: string
  readonly kind: BindableFieldKind
  /** Present when kind === 'nested'. */
  readonly parentRepeaterFieldId: string | null
}

function provenanceWidgetType(definition: FormDefinition, fieldId: string): string | undefined {
  return definition.meta.paletteProvenance.find((entry) => entry.fieldId === fieldId)?.widgetType
}

function labelsFor(definition: FormDefinition, fieldId: string): { en: string; gu: string } {
  const labels = definition.meta.bilingual.labels[fieldId]
  return {
    en: labels?.en ?? fieldId,
    gu: labels?.gu ?? fieldId,
  }
}

function isDataProducingWidget(widgetType: string): boolean {
  const palette = getPaletteWidget(widgetType)
  return palette?.producesData === true
}

/**
 * Ordered governed data-producing fields (roots + nested family members).
 * Returns [] when the definition fails integrity (caller treats as non-authorable).
 */
export function collectBindableFields(definition: FormDefinition): readonly BindableField[] {
  try {
    assertDefinitionIntegrity(definition)
  } catch {
    return []
  }

  const uiOrder = readUiOrder(definition)
  const nestedPaths = collectFamilyRepeaterNestedPaths(definition)
  const nestedByRepeater = new Map<string, string[]>()
  for (const [path, meta] of nestedPaths) {
    const list = nestedByRepeater.get(meta.repeaterFieldId) ?? []
    list.push(path)
    nestedByRepeater.set(meta.repeaterFieldId, list)
  }

  const seen = new Set<string>()
  const result: BindableField[] = []

  const pushField = (
    fieldId: string,
    widgetType: string,
    kind: BindableFieldKind,
    parentRepeaterFieldId: string | null,
  ) => {
    if (seen.has(fieldId)) return
    if (!isDataProducingWidget(widgetType)) return
    seen.add(fieldId)
    const labels = labelsFor(definition, fieldId)
    result.push({
      fieldId,
      widgetType,
      labelEn: labels.en,
      labelGu: labels.gu,
      kind,
      parentRepeaterFieldId,
    })
  }

  for (const fieldId of uiOrder) {
    const widgetType = provenanceWidgetType(definition, fieldId)
    if (widgetType === undefined) continue
    pushField(fieldId, widgetType, 'root', null)

    if (widgetType === 'family-repeater') {
      const children = nestedByRepeater.get(fieldId) ?? []
      // Nested map iteration follows property admission order via Map insertion
      // in collectFamilyRepeaterNestedPaths (propertyKeys order).
      for (const nestedPath of children) {
        const nestedWidget = provenanceWidgetType(definition, nestedPath)
        if (nestedWidget === undefined) continue
        pushField(nestedPath, nestedWidget, 'nested', fieldId)
      }
    }
  }

  return result
}

export function isBindableFieldId(definition: FormDefinition, fieldId: string): boolean {
  return collectBindableFields(definition).some((field) => field.fieldId === fieldId)
}

/** Index of fieldId in the bindable graph, or -1. */
export function bindableFieldOrderIndex(definition: FormDefinition, fieldId: string): number {
  return collectBindableFields(definition).findIndex((field) => field.fieldId === fieldId)
}

/**
 * Map bindable field IDs (including nested paths) to canvas root field IDs for dirty chips.
 */
export function canvasRootFieldIdsForBindingTargets(
  definition: FormDefinition,
  fieldIds: Iterable<string>,
): ReadonlySet<string> {
  const byId = new Map(collectBindableFields(definition).map((field) => [field.fieldId, field]))
  const roots = new Set<string>()
  for (const id of fieldIds) {
    const field = byId.get(id)
    if (!field) continue
    if (field.kind === 'nested' && field.parentRepeaterFieldId !== null) {
      roots.add(field.parentRepeaterFieldId)
    } else {
      roots.add(field.fieldId)
    }
  }
  return roots
}

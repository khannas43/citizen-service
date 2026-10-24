import type { PaletteGroupDefinition, PaletteWidgetDefinition } from '@dg20/form-widgets'
import { PALETTE_GROUPS, listWidgetsByGroup } from '@dg20/form-widgets'

export interface PaletteSearchGroup {
  readonly group: PaletteGroupDefinition
  readonly widgets: readonly PaletteWidgetDefinition[]
}

function matchesQuery(widget: PaletteWidgetDefinition, query: string): boolean {
  const haystacks = [
    widget.labelEn,
    widget.labelGu,
    widget.descriptionEn,
    widget.descriptionGu,
    widget.widgetType,
    widget.category,
  ]
  return haystacks.some((value) => value.toLowerCase().includes(query))
}

/**
 * Filter the controlled palette by search text across EN and GU metadata.
 * Preserves PALETTE_GROUPS order and registry order within each group.
 * Hides empty groups. Does not mutate registry data.
 */
export function filterPaletteGroups(searchText: string): readonly PaletteSearchGroup[] {
  const query = searchText.trim().toLowerCase()
  const groups: PaletteSearchGroup[] = []

  for (const group of PALETTE_GROUPS) {
    const widgets = listWidgetsByGroup(group.groupId)
    const filtered = query.length === 0 ? widgets : widgets.filter((w) => matchesQuery(w, query))
    if (filtered.length > 0) {
      groups.push({ group, widgets: filtered })
    }
  }

  return groups
}

export function countFilteredWidgets(groups: readonly PaletteSearchGroup[]): number {
  return groups.reduce((sum, entry) => sum + entry.widgets.length, 0)
}

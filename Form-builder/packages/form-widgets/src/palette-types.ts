/**
 * Controlled palette metadata types (spec §4).
 *
 * This package ships registry metadata only in FB-0.
 * React / RJSF widget implementations arrive in a later increment.
 */

/** Palette group IDs matching specification sections 4.1–4.6. */
export const PALETTE_GROUP_IDS = [
  'identity-citizen',
  'address',
  'documents',
  'choice-structured',
  'free-numeric',
  'government-composite-layout',
] as const

export type PaletteGroupId = (typeof PALETTE_GROUP_IDS)[number]

/**
 * Widget category for Builder UX and validation.
 * - `data` — produces form data
 * - `display` — visual grouping/help; no data
 * - `layout` — progressive-profiling / structural boundary; no data
 */
export type WidgetCategory = 'data' | 'display' | 'layout'

/** Implementation progress for each palette entry. */
export type WidgetImplementationStatus = 'planned' | 'scaffolded' | 'implemented'

export interface PaletteGroupDefinition {
  readonly groupId: PaletteGroupId
  readonly labelEn: string
  readonly labelGu: string
  readonly descriptionEn: string
  readonly descriptionGu: string
  /** Spec section reference, e.g. "4.1". */
  readonly specSection: string
}

export interface PaletteWidgetDefinition {
  readonly widgetType: string
  readonly groupId: PaletteGroupId
  readonly category: WidgetCategory
  readonly labelEn: string
  readonly labelGu: string
  readonly descriptionEn: string
  readonly descriptionGu: string
  readonly producesData: boolean
  readonly supportsRequired: boolean
  readonly configurableProperties: readonly string[]
  readonly bakedInBehaviours: readonly string[]
  readonly implementationStatus: WidgetImplementationStatus
}

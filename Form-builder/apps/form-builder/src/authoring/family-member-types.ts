/**
 * Builder-only governed nested member palette for family-repeater (FB-D16).
 * Explicit set — do not infer from palette category.
 */

export const FAMILY_MEMBER_WIDGET_TYPES = [
  'text-short',
  'text-long',
  'number',
  'currency-inr',
  'percentage',
  'email',
  'dob',
  'gender',
  'yesno',
] as const

export type FamilyMemberWidgetType = (typeof FAMILY_MEMBER_WIDGET_TYPES)[number]

const FAMILY_MEMBER_SET = new Set<string>(FAMILY_MEMBER_WIDGET_TYPES)

export function isFamilyMemberWidgetType(t: string): t is FamilyMemberWidgetType {
  return FAMILY_MEMBER_SET.has(t)
}

/**
 * Lifecycle status of a Form Definition (spec §2).
 *
 * Publish gate: draft → submitted → (DST approval) → approved → published.
 * Only `published` definitions are renderable to citizens. `retired` ends the line.
 */
export const FORM_STATUSES = ['draft', 'submitted', 'approved', 'published', 'retired'] as const

export type FormStatus = (typeof FORM_STATUSES)[number]

export function isFormStatus(value: string): value is FormStatus {
  return (FORM_STATUSES as readonly string[]).includes(value)
}

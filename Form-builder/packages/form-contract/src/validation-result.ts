/**
 * Result of Form Definition validation (client or server pipeline).
 * Severity and issue shape are contract-level; the five-stage pipeline
 * (spec §6) is implemented by the future form-definition-service.
 */

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  readonly code: string
  readonly message: string
  readonly severity: ValidationSeverity
  /** Optional field or path within the Form Definition / form data. */
  readonly path?: string
}

export interface ValidationResult {
  readonly valid: boolean
  readonly issues: readonly ValidationIssue[]
}

import type { FormDefinition, ValidationResult } from '@dg20/form-contract'

/**
 * Builder-owned port for Unit C Form Definition validation (FB-D6).
 * Not part of WidgetServicePorts. Adapters must not mutate Builder state.
 */
export interface FormDefinitionValidationAdapter {
  validateDefinition(request: {
    readonly definition: FormDefinition
    readonly signal: AbortSignal
  }): Promise<ValidationResult>
}

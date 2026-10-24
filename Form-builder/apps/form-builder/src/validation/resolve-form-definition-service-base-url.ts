/**
 * Resolves the Form Definition Service base URL for Builder HTTP validation.
 * Production default is same-origin `/form-definition-service`.
 * Never hardcodes localhost into application code.
 */
export function resolveFormDefinitionServiceBaseUrl(
  env: Readonly<Record<string, unknown>> = import.meta.env as Readonly<Record<string, unknown>>,
): string {
  const raw = env.VITE_FORM_DEFINITION_SERVICE_BASE_URL
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.length > 0) {
      return trimmed.replace(/\/+$/, '')
    }
  }
  return '/form-definition-service'
}

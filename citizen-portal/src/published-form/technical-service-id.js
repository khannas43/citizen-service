import { admitServiceId } from './admit/admit-service-id.js'

/**
 * Optional development technical preview serviceId from env.
 * Returns null when absent or not admitted.
 */
export function resolveTechnicalFormServiceId() {
  const raw = import.meta.env?.VITE_DG20_TECHNICAL_FORM_SERVICE_ID
  if (typeof raw !== 'string') return null
  const admitted = admitServiceId(raw)
  return admitted.ok ? admitted.serviceId : null
}

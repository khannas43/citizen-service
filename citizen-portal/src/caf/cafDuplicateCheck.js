import { displayAppNo } from '../api'

const BLOCKING_STATUSES = new Set(['PENDING', 'PENDINGAPPROVAL', 'APPROVED'])

export function isBlockingStatus(status) {
  return BLOCKING_STATUSES.has(status || 'PENDING')
}

/**
 * Returns an existing application that blocks a new submission, or null.
 */
export function findBlockingApplication(serviceKey, existingApps, specific = {}) {
  const forService = (existingApps || []).filter(
    (app) => app.service === serviceKey && isBlockingStatus(app.status)
  )
  if (!forService.length) return null

  if (serviceKey === 'caste') return forService[0]

  if (serviceKey === 'pension') {
    const type = specific.pensionType
    return forService.find((app) => app.pensionType === type) ?? null
  }

  if (serviceKey === 'scheme') {
    const id = specific.schemeId
    if (!id) return null
    return forService.find((app) => app.schemeId === id) ?? null
  }

  return null
}

export function duplicateBlockMessage(serviceKey, app, t) {
  const ref = displayAppNo(app)
  const serviceName = t(`services.${serviceKey}`, serviceKey)
  if (app.status === 'APPROVED') {
    return `${serviceName} already issued (${ref}). You cannot apply again.`
  }
  return `${serviceName} application already in progress (${ref}). Track it on My Applications.`
}

export function findAllBlocking(selectedServices, existingApps, specific) {
  return selectedServices
    .map((key) => {
      const blocking = findBlockingApplication(key, existingApps, specific[key] ?? {})
      if (!blocking) return null
      return { serviceKey: key, app: blocking }
    })
    .filter(Boolean)
}

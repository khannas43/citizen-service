/** Translated labels for service keys, statuses, and app metadata. */
export function serviceLabel(service, t) {
  if (!service) return ''
  return t(`services.${service}`, service)
}

export function statusLabel(status, t) {
  if (!status) return ''
  return t(`status.${status}`, status)
}

export function enrollmentStatusLabel(status, t) {
  if (!status) return ''
  return t(`enrollmentStatus.${status}`, status)
}

export function appMetaLabel(app, t) {
  if (app.schemeName) return app.schemeName
  if (app.pensionType) return t(`pensionTypes.${app.pensionType}`, app.pensionType)
  if (app.changeType) return t(`changeTypes.${app.changeType}`, app.changeType)
  if (app.casteCode) return app.casteCode
  return ''
}

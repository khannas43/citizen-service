import i18n from './i18n'

const MDM = '/mdm-service/api/citizen'

async function call(path, opts = {}) {
  const token = localStorage.getItem('citizen_token')
  const res = await fetch(`${MDM}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Accept-Language': i18n.language || 'en',
      ...(opts.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.detail || 'failed')
    err.status = res.status
    err.detail = body.detail
    throw err
  }
  return body
}

export function fetchApprovalsSummary() {
  return call('/approvals/summary')
}

export function fetchApprovals() {
  return call('/approvals')
}

export function fetchApproval(key) {
  return call(`/approvals/${encodeURIComponent(key)}`)
}

export function answerEventApproval(eventId, body) {
  return call(`/approvals/event-${eventId}/answer`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** UC4 single-consent card. body: { decision: 'GRANT'|'REFUSE', elements?, relationship?, declared? } (relationship and declared: a parent answering for a student under 18). */
export function answerConsentApproval(consentId, body) {
  return call(`/approvals/consent-${consentId}/answer`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** body: { decision, note?, choice?: 'A'|'B'|'OTHER', reported_value? } (choice and reported_value: CONFIRM_DETAILS). */
export function answerRequestApproval(requestId, body) {
  return call(`/approvals/req-${requestId}/answer`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** The details a citizen may report, each with what the record shows now. */
export function fetchReportOptions() {
  return call('/reports/options')
}

export function fetchReports() {
  return call('/reports')
}

export function createReport(body) {
  return call('/reports', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function withdrawConsent(consentId) {
  return call(`/consents/${consentId}/withdraw`, { method: 'POST' })
}

/** Household from master data (spouse, children, parents, ration-card sharers). */
export function fetchHousehold() {
  return call('/household')
}

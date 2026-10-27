export const DQ_LABELS = {
  DEAD_ACTIVE_ON_RATION_CARD: 'Death registered, still active on a ration card',
  DEAD_PENSION_STILL_ACTIVE: 'Death registered, pension still active',
  DOB_CONFLICT: 'Departments disagree on date of birth',
  GENDER_CONFLICT: 'Departments disagree on gender',
  CERTIFICATE_EXPIRED: 'Certificate has expired',
  INCOME_CONFLICT: 'Income certificates disagree',
  CATEGORY_CONFLICT: 'Caste certificates disagree',
  NO_IDENTITY_REFERENCE: 'No identity reference on file',
  ON_MULTIPLE_RATION_CARDS: 'Listed on more than one ration card',
  AGE_MISMATCH: 'Age on ration card does not fit date of birth',
  UNDERAGE_MARRIAGE: 'Marriage registered below the legal age',
}
export const dqLabel = (code) => DQ_LABELS[code] || code

export const LINK_LABELS = {
  AUTO_LINKED: 'Linked automatically',
  ANCHOR: 'First record of this person',
  NEW: 'Single record',
  IN_REVIEW: 'Waiting for a steward',
  STEWARD_LINKED: 'Linked by a steward',
  STEWARD_SEPARATE: 'Kept separate by a steward',
}
export const linkLabel = (s) => LINK_LABELS[s] || s

export const LIFE_LABELS = { DECEASED: 'Death registered', NO_DEATH_RECORD: 'No death record' }
export const lifeLabel = (s) => LIFE_LABELS[s] || s

export const COMPONENT_LABELS = {
  name: 'Name', dob: 'Date of birth', gender: 'Gender', district: 'District', mandal: 'Mandal',
  village: 'Village', address: 'Address', parents: 'Parents',
}

export const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 }
export const SEVERITY_LABELS = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }

export const RELATION_TEXT = { SPOUSE: 'Spouse', PARENT: 'Parent', CHILD: 'Child' }

export function pct(n, d) {
  return d ? Math.round((100 * n) / d) : 0
}

export function fmtDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtFresh(hours) {
  if (hours == null) return '—'
  if (hours <= 24) return 'Up to a day old'
  if (hours <= 24 * 7) return 'Up to a week old'
  if (hours <= 24 * 31) return 'Up to a month old'
  if (hours <= 24 * 95) return 'Up to a quarter old'
  return 'Up to a year old'
}

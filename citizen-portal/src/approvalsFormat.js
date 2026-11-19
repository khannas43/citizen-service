import i18n from './i18n'
import { LOCAL_LANG } from './lang'

/** Locale for dates: Telugu months when the UI is in Telugu. */
export function dateLocale(lang = i18n.language) {
  const lng = (lang || 'en').split('-')[0]
  if (lng === LOCAL_LANG || lng === 'te') return 'te-IN'
  if (lng === 'hi') return 'hi-IN'
  return 'en-GB'
}

export function fmtDate(iso, lang) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(dateLocale(lang), {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function fmtDateTime(iso, lang) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(dateLocale(lang), {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const FIELD_KEY = {
  address: 'approvals.field.address',
  name: 'approvals.field.name',
  dob: 'approvals.field.dob',
  date_of_birth: 'approvals.field.dob',
  'date of birth': 'approvals.field.dob',
  relationship: 'approvals.field.relationship',
}

export function fieldLabel(t, key) {
  const mapped = FIELD_KEY[key] || FIELD_KEY[String(key || '').toLowerCase()]
  return mapped ? t(mapped) : String(key || '').replace(/_/g, ' ')
}

function leaf(v) {
  if (v == null || v === '') return '—'
  if (typeof v !== 'object') return String(v)
  return Object.entries(v).map(([k, x]) => `${k}: ${leaf(x)}`).join(', ')
}

/** Turn a nested detail value into readable text lines (never "[object Object]"). */
export function detailLines(t, value) {
  if (value == null) return ['—']
  if (typeof value !== 'object') return [String(value)]
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => {
      if (item && typeof item === 'object') {
        if ('label' in item || 'current' in item || 'proposed' in item) {
          const lab = item.label ? fieldLabel(t, item.label) : `#${i + 1}`
          if ('current' in item || 'proposed' in item) {
            return [`${lab}: ${t('approvals.currentProposed', { current: leaf(item.current), proposed: leaf(item.proposed) })}`]
          }
          return [`${lab}: ${leaf(item)}`]
        }
        return detailLines(t, item)
      }
      return [String(item)]
    })
  }
  if ('current' in value || 'proposed' in value) {
    return [t('approvals.currentProposed', { current: leaf(value.current), proposed: leaf(value.proposed) })]
  }
  return Object.entries(value).map(([k, v]) => `${fieldLabel(t, k)}: ${leaf(v)}`)
}

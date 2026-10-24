export const humanize = (s) => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

// Overlay rules carry raw enum values (WIDOWED, FARMER,AGRICULTURIST); show them as words.
export function formatCriterionValue(value) {
  const s = String(value ?? '')
  return /^[A-Z_]+(\s*,\s*[A-Z_]+)*$/.test(s) ? s.split(',').map((p) => humanize(p.trim())).join(', ') : s
}

export function formatBenefit(type, value, t) {
  if (!value && !type) return ''
  const raw = String(value ?? '').trim()
  if (/^\d+$/.test(raw)) {
    const amount = `\u20B9${Number(raw).toLocaleString('en-IN')}`
    const suffix = t(`schemeDetails.benefitSuffix.${type}`, { defaultValue: '' })
    return suffix ? `${amount} ${suffix}` : amount
  }
  return raw || humanize(type)
}

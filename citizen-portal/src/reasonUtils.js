const TRANSLATIONS = {
  Age: 'ઉંમર',
  minimum: 'ન્યૂનતમ',
  maximum: 'મહત્તમ',
  Income: 'આવક',
  ceiling: 'મર્યાદા',
  Caste: 'જ્ઞાતિ',
  'in eligible list': 'પાત્ર',
  'All castes eligible': 'તમામ જ્ઞાતિ પાત્ર',
  'Family income': 'કુટુંબ આવક',
  Percentile: 'પર્સેન્ટાઈલ',
  'Std 10': 'ધોરણ 10',
  'Std 12': 'ધોરણ 12',
  Diploma: 'ડિપ્લોમા',
  'D-to-D': 'ડિપ્લોમાથી ડિગ્રી',
  'NEET-based MBBS admission': 'NEET આધારિત MBBS પ્રવેશ',
  Course: 'અભ્યાસક્રમ',
  Tuition: 'ટ્યુશન ફી',
  Boarding: 'બોર્ડિંગ',
  Books: 'પુસ્તકો',
}

export function translateCriterion(criterion, lang) {
  if (lang !== 'gu') return criterion
  let result = criterion
  Object.entries(TRANSLATIONS).forEach(([en, gu]) => {
    result = result.replace(en, gu)
  })
  return result
}

export function splitReasons(eligibilityReason) {
  if (!eligibilityReason) return []
  return eligibilityReason.split('|').map((r) => r.trim()).filter(Boolean)
}

/** One enrollment row per person+scheme (monthly DBT payouts are not separate schemes). */
export function uniqueSchemeEnrollments(rows) {
  const byKey = new Map()
  for (const b of rows || []) {
    const key = `${b.personId || b.personName || ''}|${b.schemeId || b.schemeName || ''}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, b)
      continue
    }
    const score = (x) => {
      let s = 0
      if ((x.eligibilityReason || '').includes('|')) s += 2
      if (x.disbursedAt) s += 1
      if (x.status === 'CONFIRMED' || x.status === 'ACTIVE') s += 1
      return s
    }
    const prevScore = score(prev)
    const nextScore = score(b)
    if (nextScore > prevScore) byKey.set(key, b)
    else if (nextScore === prevScore && new Date(b.disbursedAt || 0) > new Date(prev.disbursedAt || 0)) {
      byKey.set(key, b)
    }
  }
  return [...byKey.values()]
}

const DEMO_PIN_SCHEME = 'Ayushman Gujarat'

function schemeLabel(item) {
  return String(item?.name || item?.schemeName || item?.scheme_name || '')
}

/** Keep the demo scheme first in Priya's eligible / apply lists. */
export function pinDemoSchemeFirst(items, schemeName = DEMO_PIN_SCHEME) {
  if (!Array.isArray(items) || items.length === 0) return items || []
  const match = (item) => schemeLabel(item) === schemeName
  const top = items.filter(match)
  const rest = items.filter((item) => !match(item))
  return [...top, ...rest]
}

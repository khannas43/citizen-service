import { LOCAL_LANG } from './lang'
const TRANSLATIONS = {
  Age: 'వయస్సు',
  minimum: 'కనిష్ఠ',
  maximum: 'గరిష్ఠ',
  Income: 'ఆదాయం',
  ceiling: 'పరిమితి',
  Caste: 'కులం',
  'in eligible list': 'అర్హత',
  'All castes eligible': 'అన్ని కులాలు అర్హులు',
  'Family income': 'కుటుంబ ఆదాయం',
  Percentile: 'పర్సంటైల్',
  'Std 10': '10వ తరగతి',
  'Std 12': 'ఇంటర్మీడియట్',
  Diploma: 'డిప్లొమా',
  'D-to-D': 'డిప్లొమా నుండి డిగ్రీ',
  'NEET-based MBBS admission': 'NEET ఆధారిత MBBS ప్రవేశం',
  Course: 'కోర్సు',
  Tuition: 'ట్యూషన్ ఫీజు',
  Boarding: 'వసతి',
  Books: 'పుస్తకాలు',
}

export function translateCriterion(criterion, lang) {
  if (lang !== LOCAL_LANG) return criterion
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

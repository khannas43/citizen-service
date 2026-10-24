export const CAF_DOCUMENT_RULES = [
  {
    id: 'aadhaar',
    label: 'Aadhar',
    matchers: ['aadhaar', 'aadhar', 'uid'],
    requiredFor: ['caste', 'pension', 'scheme'],
    hint: 'Required for all applications',
  },
  {
    id: 'income_proof',
    label: 'Income Certificate / Proof',
    matchers: ['income', 'salary', 'itr'],
    requiredFor: [],
    recommendedFor: ['pension', 'scheme'],
    hint: 'Recommended for pension and scheme applications',
  },
  {
    id: 'caste_proof',
    label: 'Caste / Community Certificate',
    matchers: ['caste', 'obc', 'sc ', 'st ', 'community'],
    requiredFor: [],
    recommendedFor: ['caste'],
    hint: 'Recommended when applying for caste certificate',
  },
  {
    id: 'death_certificate',
    label: 'Death Certificate (spouse)',
    matchers: ['death', 'demise'],
    requiredFor: [],
    recommendedFor: ['pension'],
    hint: 'Recommended for widow pension',
  },
  {
    id: 'bank_passbook',
    label: 'Bank Passbook / Account proof',
    matchers: ['bank', 'passbook', 'account'],
    requiredFor: [],
    recommendedFor: ['pension', 'scheme'],
    hint: 'Recommended for benefit disbursement',
  },
]

function docTypeMatchesRule(docType, rule) {
  const lower = (docType || '').toLowerCase()
  return rule.matchers.some((m) => lower.includes(m))
}

const CAF_HIDDEN_FILES = new Set([
  'income-certificate.pdf',
  'aadhaar-ekyc.pdf',
  'aadhar-ekyc.pdf',
])

export function formatCafDocType(docType) {
  const raw = String(docType || '').trim()
  if (/^aadha?ar(\s+card)?$/i.test(raw)) return 'Aadhar'
  return raw
}

export function cafVisibleFileName(fileName) {
  const name = String(fileName || '').trim()
  if (!name) return null
  if (CAF_HIDDEN_FILES.has(name.toLowerCase())) return null
  return name
}

function isTrustedVaultDoc(doc) {
  return Boolean(doc?.trustedSource)
}

/** CAF vault: hide dummy PDF names on trusted pulls only; keep every citizen upload. */
export function presentCafVaultDocs(docs) {
  const mapped = (docs || []).map((d) => {
    const trusted = isTrustedVaultDoc(d)
    const rawName = String(d?.fileName || '').trim() || null
    return {
      ...d,
      docType: formatCafDocType(d.docType),
      fileName: trusted ? cafVisibleFileName(d.fileName) : rawName,
    }
  })
  const seenTrusted = new Set()
  const unique = []
  for (const d of mapped) {
    if (isTrustedVaultDoc(d)) {
      const key = `${d.docType}|${d.trustedSource}`
      if (seenTrusted.has(key)) continue
      seenTrusted.add(key)
    }
    unique.push(d)
  }
  return unique
}

/** Keep in-progress uploads when DigiLocker sync returns and would otherwise replace the list. */
export function mergeCafVaultDocs(fromServer, previous) {
  const presented = presentCafVaultDocs(fromServer)
  const ids = new Set(presented.map((d) => d.id).filter(Boolean))
  const extras = (previous || []).filter(
    (d) => d?.id && !ids.has(d.id) && !isTrustedVaultDoc(d),
  )
  return [...extras, ...presented]
}

export function validateCafDocuments(selectedServices, vaultDocs, selectedDocIds, specificFields) {
  const selectedTypes = vaultDocs
    .filter((d) => selectedDocIds.has(d.id))
    .map((d) => d.docType)

  const missingRequired = []
  const warnings = []

  for (const rule of CAF_DOCUMENT_RULES) {
    const appliesRequired = rule.requiredFor.some((s) => selectedServices.includes(s))
    const appliesRecommended = rule.recommendedFor?.some((s) => selectedServices.includes(s))
    if (!appliesRequired && !appliesRecommended) continue

    const satisfied = selectedTypes.some((t) => docTypeMatchesRule(t, rule))

    if (appliesRequired && !satisfied) missingRequired.push(rule.label)
    else if (appliesRecommended && !satisfied) warnings.push(rule.label)
  }

  if (
    selectedServices.includes('pension') &&
    specificFields?.pension?.pensionType === 'WIDOW'
  ) {
    const deathRule = CAF_DOCUMENT_RULES.find((r) => r.id === 'death_certificate')
    const hasDeath = selectedTypes.some((t) => docTypeMatchesRule(t, deathRule))
    if (!hasDeath) warnings.push(deathRule.label)
  }

  return { missingRequired, warnings }
}

export function requiredDocHints(selectedServices) {
  const labels = new Set()
  for (const rule of CAF_DOCUMENT_RULES) {
    if (rule.requiredFor.some((s) => selectedServices.includes(s))) {
      labels.add(rule.label)
    }
  }
  return [...labels]
}

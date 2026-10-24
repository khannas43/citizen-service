import { apiForService } from '../api'

export const CAF_PHASE1_SERVICES = ['caste', 'pension', 'scheme']

export const CAF_SERVICE_CONFIG = {
  caste: {
    key: 'caste',
    labelKey: 'services.caste',
    icon: '📜',
    enabledInCaf: true,
    apiBase: () => apiForService('caste'),
    defaultSpecific: {},
    validateSpecific: () => null,
    buildPayload: (common) => ({
      applicantName: common.name,
      casteCode: common.casteCategory,
      aadhaarRef: common.aadhaarRef,
      tenantId: 'pg',
    }),
    summaryLine: (common, _specific, t) =>
      `${common.name} · ${common.casteCategory || t('form.casteCategory')}`,
  },

  pension: {
    key: 'pension',
    labelKey: 'services.pension',
    icon: '🧓',
    enabledInCaf: true,
    apiBase: () => apiForService('pension'),
    defaultSpecific: { pensionType: 'WIDOW' },
    validateSpecific: (specific) =>
      specific?.pensionType ? null : 'Pension type is required',
    buildPayload: (common, specific) => ({
      applicantName: common.name,
      pensionType: specific.pensionType,
      aadhaarRef: common.aadhaarRef,
      familyId: common.familyId || null,
      tenantId: 'pg',
    }),
    summaryLine: (common, specific, t) =>
      `${common.name} · ${t(`pensionTypes.${specific.pensionType}`)}`,
  },

  scheme: {
    key: 'scheme',
    labelKey: 'services.scheme',
    icon: '🏛',
    enabledInCaf: true,
    apiBase: () => apiForService('scheme'),
    defaultSpecific: { schemeId: '', schemeName: '' },
    validateSpecific: (specific) =>
      specific?.schemeId ? null : 'Scheme selection is required',
    buildPayload: (common, specific) => ({
      schemeId: specific.schemeId,
      schemeName: specific.schemeName,
      familyId: common.familyId,
      aadhaarRef: common.aadhaarRef,
      declaredIncome: Number(common.annualIncome ?? 0),
      tenantId: 'pg',
    }),
    summaryLine: (_common, specific) => specific.schemeName || '—',
  },
}

export function getCafServiceTiles() {
  return CAF_PHASE1_SERVICES.map((key) => CAF_SERVICE_CONFIG[key])
}

export async function submitServiceApplication(serviceKey, common, specific, options = {}) {
  const cfg = CAF_SERVICE_CONFIG[serviceKey]
  if (!cfg) throw new Error(`Unknown service: ${serviceKey}`)

  const body = cfg.buildPayload(common, specific)
  // Documents live in the family vault (DigiLocker / UIDAI sync) — not re-posted here.

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45000)

  try {
    const res = await fetch(`${cfg.apiBase()}/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      if (detail) {
        try {
          const json = JSON.parse(detail)
          if (json.error || json.detail || json.message) {
            throw new Error(json.error || json.detail || json.message)
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            const plain = detail.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            throw new Error(plain || `Submit failed (HTTP ${res.status})`)
          }
          throw e
        }
      }
      throw new Error(`Submit failed (HTTP ${res.status})`)
    }
    return res.json()
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — please try again')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

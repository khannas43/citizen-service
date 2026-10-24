function disclaimer(signalType) {
  return `AI-assisted narrative. Detection triggered by rule ${signalType}. All actions require officer authorisation.`
}

function parseIncomeCliffDetail(detail) {
  const text = detail || ''
  const pctMatch = text.match(/(\d+)\s*%/)
  const pct = pctMatch ? pctMatch[1] : null
  const ceilingMatch = text.match(/of\s+(₹[^;\s]+|₹[\d,.]+L?)/i)
  const ceiling = ceilingMatch ? ceilingMatch[1] : 'the scheme'
  return { pct, ceiling }
}

export function generateAIBrief(signal) {
  const type = signal?.signalType || 'UNKNOWN'
  const personName = signal?.personName || 'This citizen'
  const schemeName = signal?.schemeName || 'scheme'

  let summary
  let recommendedActions
  let investigationPriority

  switch (type) {
    case 'INCOME_CLIFF': {
      const { pct, ceiling } = parseIncomeCliffDetail(signal?.detail)
      const pctText = pct ? `${pct}%` : 'a high percentage'
      summary =
        `This citizen's reported income is ${pctText} of the ${schemeName} ceiling (${ceiling}). ` +
        'Proximity to eligibility thresholds at this level may indicate income underreporting. ' +
        'Field verification is recommended before benefit renewal.'
      recommendedActions = [
        'Request latest income certificate issued by Mamlatdar',
        'Cross-check with employer records or self-employment declaration',
        'Verify land holdings if agricultural income is claimed',
      ]
      investigationPriority = 72
      break
    }
    case 'MULTI_SCHEME_OVERLAP':
      summary =
        `${personName} appears enrolled in multiple cash-transfer schemes simultaneously. ` +
        'Concurrent enrollment in overlapping income-support programmes may indicate duplicate benefit receipt. ' +
        'Coordination with the district welfare office is recommended.'
      recommendedActions = [
        'Obtain consent and cross-check programme enrollment records',
        'Verify bank account details are consistent across all schemes',
        'Confirm household income with Revenue Officer before next disbursement cycle',
      ]
      investigationPriority = 88
      break
    case 'AGE_ANOMALY':
      summary =
        'System records indicate an unusually high age for this beneficiary. ' +
        'This is likely a data-entry error from original enrollment. ' +
        'Record correction should be initiated before the next benefit disbursement cycle.'
      recommendedActions = [
        'Request original birth certificate or Aadhaar document',
        'Correct date of birth in family-registry-service',
        'Re-run eligibility check after record is updated',
      ]
      investigationPriority = 45
      break
    case 'FAMILY_INCOME_MISMATCH':
      summary =
        'The declared household total income is inconsistent with individual member income records found in the family registry. ' +
        'Partial income disclosure may be present. A full household income verification is recommended.'
      recommendedActions = [
        'Request income declarations from all earning family members',
        'Cross-check with PFMS or DBT payment records',
        'Schedule a joint household visit with the local Talati',
      ]
      investigationPriority = 78
      break
    default:
      summary =
        'An anomaly was detected for this beneficiary record. ' +
        'Manual review of the associated scheme enrollment and family registry data is recommended.'
      recommendedActions = [
        'Review beneficiary record in scheme management',
        'Cross-check family registry entry',
        'Escalate to Revenue Officer if discrepancy confirmed',
      ]
      investigationPriority = 60
  }

  return {
    summary,
    recommendedActions,
    investigationPriority,
    aiDisclaimer: disclaimer(type),
  }
}

function documentAnswer(signalType) {
  switch (signalType) {
    case 'INCOME_CLIFF':
      return "Request a current income certificate from the Mamlatdar's office and the latest salary slip or self-employment declaration."
    case 'MULTI_SCHEME_OVERLAP':
      return 'Ask the citizen to produce the passbook or benefit statement for each scheme they are enrolled in, along with a single bank account declaration.'
    case 'AGE_ANOMALY':
      return 'Request the original Aadhaar card or birth certificate to establish the correct date of birth.'
    case 'FAMILY_INCOME_MISMATCH':
      return 'Obtain income declarations (Form 16 or self-declaration) from every earning member listed in the family registry.'
    default:
      return 'Request the relevant identity and income documents from the citizen and cross-check with the family registry.'
  }
}

function timelineAnswer(severity) {
  switch (severity) {
    case 'HIGH':
      return (
        'This is a high-priority signal. Target resolution within 48 hours. Escalate to Revenue Officer immediately if ' +
        'field verification cannot be completed by the Talati within the next working week.'
      )
    case 'MEDIUM':
      return (
        'This signal should be reviewed within 5 working days. Schedule verification at the earliest available opportunity ' +
        'without disrupting current caseload.'
      )
    case 'LOW':
    default:
      return (
        'This is a low-priority data-quality flag. Address in the next routine review cycle, typically within 15 working days.'
      )
  }
}

function riskAnswer(severity) {
  switch (severity) {
    case 'HIGH':
      return (
        'Confirmed overlap patterns can result in duplicate disbursements or benefit fraud. Early intervention protects ' +
        'scheme funds and ensures fair access for eligible citizens.'
      )
    case 'MEDIUM':
      return (
        'This signal warrants attention but is not immediately critical. Monitor and verify to maintain scheme integrity ' +
        'over successive disbursement cycles.'
      )
    case 'LOW':
    default:
      return (
        'The risk is limited to record accuracy. If left uncorrected, it may cause audit observations during periodic scheme review.'
      )
  }
}

export function askAboutSignal(signal, question) {
  const q = (question || '').toLowerCase().trim()
  const type = signal?.signalType || 'UNKNOWN'
  const severity = signal?.severity || 'MEDIUM'

  if (!q) {
    return 'Please enter a question about this signal.'
  }

  if (/(document|certificate|proof|submit)/.test(q)) {
    return documentAnswer(type)
  }

  if (/(district|common|pattern|frequent)/.test(q)) {
    return (
      'INCOME_CLIFF signals are more common in districts with large agricultural populations where seasonal income varies. ' +
      'MULTI_SCHEME_OVERLAP signals are typically higher in urban districts with multiple active welfare programmes. ' +
      'This case warrants comparison with recent signals in the same district.'
    )
  }

  if (/(verify|check|confirm|validate)/.test(q)) {
    return (
      'Begin with a digital cross-check of the family registry entry against the scheme enrollment record. ' +
      'If the discrepancy persists, schedule a physical household visit coordinated with the local Talati and Revenue Officer.'
    )
  }

  if (/(action|next|step|do|proceed)/.test(q)) {
    const { recommendedActions } = generateAIBrief(signal)
    return recommendedActions.map((a, i) => `${i + 1}. ${a}`).join('\n')
  }

  if (/(timeline|deadline|urgent|when)/.test(q)) {
    return timelineAnswer(severity)
  }

  if (/(risk|serious|impact|consequence)/.test(q)) {
    return riskAnswer(severity)
  }

  return (
    'I can help with questions about verification steps, common patterns in this district, recommended next actions, ' +
    'timelines, or risk level. Please rephrase your question.'
  )
}

export function fraudSignalKey(signal) {
  return `${signal?.personId || 'p'}-${signal?.signalType || 't'}-${signal?.schemeId || 's'}`
}

export function maskAadhaar(ref) {
  if (!ref) return null
  const parts = ref.split('-')
  if (parts.length >= 4) {
    return `${parts[0]}-${parts[1]}-****`
  }
  if (ref.length > 4) {
    return `${ref.slice(0, -4)}****`
  }
  return 'XXXX-XXXX-****'
}

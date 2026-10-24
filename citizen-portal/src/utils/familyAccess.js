export const ADULT_AGE = 18

export function ageFromDob(dob) {
  if (!dob) return null
  const d = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) {
    age -= 1
  }
  return age
}

export function isMinor(member) {
  const age = ageFromDob(member?.dob)
  return age != null && age < ADULT_AGE
}

export function findMember(members, aadhaarRef) {
  return members.find((m) => m.aadhaarRef === aadhaarRef)
}

/** Alive registry HEAD, or acting head when HEAD is deceased (adult SPOUSE/OTHER). */
export function isHouseholdHead(viewerAadhaar, members) {
  const viewer = findMember(members, viewerAadhaar)
  if (!viewer || viewer.isAlive === false) return false

  const aliveHead = members.find((m) => m.relationshipToHead === 'HEAD' && m.isAlive !== false)
  if (aliveHead) return aliveHead.aadhaarRef === viewerAadhaar

  if (ageFromDob(viewer.dob) == null || ageFromDob(viewer.dob) < ADULT_AGE) return false
  return ['SPOUSE', 'OTHER'].includes(viewer.relationshipToHead)
}

export function isSelf(viewerAadhaar, target) {
  return viewerAadhaar === target?.aadhaarRef
}

export function consentStorageKey(viewerAadhaar, targetAadhaar) {
  return `dg_profile_consent_${viewerAadhaar}_${targetAadhaar}`
}

export function hasProfileConsent(viewerAadhaar, targetAadhaar) {
  return sessionStorage.getItem(consentStorageKey(viewerAadhaar, targetAadhaar)) === 'granted'
}

export function grantProfileConsent(viewerAadhaar, targetAadhaar) {
  sessionStorage.setItem(consentStorageKey(viewerAadhaar, targetAadhaar), 'granted')
}

export function needsConsentOtp(viewerAadhaar, target, members) {
  if (isSelf(viewerAadhaar, target)) return false
  if (!isHouseholdHead(viewerAadhaar, members)) return false
  if (target.isAlive === false || isMinor(target)) return false
  if (hasProfileConsent(viewerAadhaar, target.aadhaarRef)) return false
  return true
}

export function canOpenProfile(viewerAadhaar, target, members) {
  if (!target) return { allowed: false, reason: 'notFound' }
  if (isSelf(viewerAadhaar, target)) return { allowed: true }
  if (!isHouseholdHead(viewerAadhaar, members)) {
    return { allowed: false, reason: 'notHead' }
  }
  if (target.isAlive === false || isMinor(target) || hasProfileConsent(viewerAadhaar, target.aadhaarRef)) {
    return { allowed: true }
  }
  return { allowed: true, reason: 'otpRequired' }
}

export function maskAadhaar(ref) {
  if (!ref) return '—'
  const parts = ref.split('-')
  if (parts.length === 3) return `XXXX-XXXX-${parts[2]}`
  return ref
}

export function maskMobile(mobile) {
  if (!mobile) return '—'
  const s = String(mobile)
  return s.length <= 4 ? s : `${'X'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`
}

import { useEffect, useState } from 'react'
import { fetchCitizenFamily } from '../api'
import './CitizenProfileModal.css'

function maskAadhaarRef(ref) {
  if (!ref || typeof ref !== 'string') return '—'
  const trimmed = ref.trim()
  if (/^X{4}-X{4}-\d{4}$/i.test(trimmed)) return `****-****-${trimmed.slice(-4)}`
  if (trimmed.length <= 4) return '****'
  return `****${trimmed.slice(-4)}`
}

function formatIncome(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—'
  const n = Number(amount)
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`
  return `₹${n.toLocaleString()}`
}

/**
 * @param {{ personName?: string, personId?: string, familyId?: string, payrollInfo?: Record<string, string> } | null} subject
 */
export default function CitizenProfileModal({ subject, onClose }) {
  const [loading, setLoading] = useState(false)
  const [member, setMember] = useState(null)
  const [family, setFamily] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const payroll = subject?.payrollInfo
  const isPayroll = Boolean(payroll && Object.keys(payroll).length)

  useEffect(() => {
    if (!subject || isPayroll) {
      setLoading(false)
      setMember(null)
      setFamily(null)
      setLoadFailed(false)
      return undefined
    }
    if (!subject.familyId) {
      setLoading(false)
      setMember(null)
      setFamily(null)
      setLoadFailed(true)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setLoadFailed(false)
    fetchCitizenFamily(subject.familyId)
      .then((fam) => {
        if (cancelled) return
        const pid = subject.personId ? String(subject.personId).toLowerCase() : ''
        const m = fam?.members?.find((x) => pid && String(x.id).toLowerCase() === pid)
          || fam?.members?.find((x) => x.name === subject.personName)
        setMember(m ?? null)
        setFamily(fam ?? null)
        setLoadFailed(!m)
      })
      .catch(() => {
        if (!cancelled) {
          setMember(null)
          setFamily(null)
          setLoadFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [subject, isPayroll])

  if (!subject) return null

  const title = isPayroll ? '👤 Employee profile' : '👤 Citizen Profile'
  const displayName = subject.personName || '—'

  return (
    <div className="ben-modal-overlay" onClick={onClose} role="presentation">
      <div className="ben-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="citizen-profile-title">
        <div className="ben-modal-header">
          <span className="ben-modal-title" id="citizen-profile-title">{title}</span>
          <button type="button" className="ben-modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {isPayroll ? (
          <div className="ben-modal-body">
            <div className="ben-modal-section">
              <div className="ben-modal-section-title">Identity</div>
              <div className="ben-modal-row"><span>Name</span><strong>{displayName}</strong></div>
              {payroll.employeeCode && (
                <div className="ben-modal-row"><span>Employee code</span><strong>{payroll.employeeCode}</strong></div>
              )}
              {payroll.post && <div className="ben-modal-row"><span>Post</span><strong>{payroll.post}</strong></div>}
              {payroll.payLevel && <div className="ben-modal-row"><span>Pay level</span><strong>{payroll.payLevel}</strong></div>}
              {payroll.ddoCode && <div className="ben-modal-row"><span>DDO</span><strong>{payroll.ddoCode}</strong></div>}
              {payroll.employmentStatus && (
                <div className="ben-modal-row"><span>Status</span><strong>{payroll.employmentStatus}</strong></div>
              )}
            </div>
          </div>
        ) : loading ? (
          <div className="ben-modal-loading">Loading profile…</div>
        ) : member ? (
          <div className="ben-modal-body">
            <div className="ben-modal-section">
              <div className="ben-modal-section-title">Identity</div>
              <div className="ben-modal-row"><span>Name</span><strong>{member.name}</strong></div>
              <div className="ben-modal-row">
                <span>Age</span>
                <strong>{member.dob ? new Date().getFullYear() - new Date(member.dob).getFullYear() : '—'} yrs</strong>
              </div>
              <div className="ben-modal-row"><span>Gender</span><strong>{member.gender || '—'}</strong></div>
              <div className="ben-modal-row"><span>Relationship</span><strong>{member.relationshipToHead || '—'}</strong></div>
              {member.aadhaarRef && (
                <div className="ben-modal-row">
                  <span>Aadhaar</span>
                  <strong>{maskAadhaarRef(member.aadhaarRef)}</strong>
                </div>
              )}
            </div>
            <div className="ben-modal-section">
              <div className="ben-modal-section-title">Socio-Economic</div>
              <div className="ben-modal-row"><span>Caste</span><strong>{member.casteCategory || '—'}</strong></div>
              <div className="ben-modal-row"><span>Occupation</span><strong>{member.occupation || '—'}</strong></div>
              <div className="ben-modal-row">
                <span>Annual Income</span>
                <strong>{member.annualIncome != null ? formatIncome(member.annualIncome) : '—'}</strong>
              </div>
              <div className="ben-modal-row"><span>Education</span><strong>{member.educationLevel || '—'}</strong></div>
              <div className="ben-modal-row"><span>Marital Status</span><strong>{member.maritalStatus || '—'}</strong></div>
              <div className="ben-modal-row"><span>Employment</span><strong>{member.employmentStatus || '—'}</strong></div>
            </div>
            {family && (
              <div className="ben-modal-section">
                <div className="ben-modal-section-title">Family</div>
                <div className="ben-modal-row"><span>District</span><strong>{family.district || '—'}</strong></div>
                <div className="ben-modal-row"><span>Taluka</span><strong>{family.taluka || '—'}</strong></div>
                <div className="ben-modal-row"><span>Family size</span><strong>{family.members?.length || '—'} members</strong></div>
                <div className="ben-modal-row">
                  <span>Family income</span>
                  <strong>{family.totalAnnualIncome != null ? formatIncome(family.totalAnnualIncome) : '—'}</strong>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="ben-modal-loading">
            Could not load profile for <strong>{displayName}</strong>.
            {loadFailed && !subject.familyId && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>No family registry link on this alert.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { loadCitizenProfile } from '../auth'
import {
  fetchFamily,
  fetchFamilyBeneficiaries,
  fetchFamilyIncome,
} from '../api'
import { splitReasons, translateCriterion, uniqueSchemeEnrollments } from '../reasonUtils'
import MemberProfile360 from '../components/MemberProfile360'
import SchemeRecommendations from '../components/SchemeRecommendations'
import {
  ageFromDob,
  canOpenProfile,
  isHouseholdHead,
  isSelf,
} from '../utils/familyAccess'

const REL_ORDER = { HEAD: 0, SPOUSE: 1, FATHER: 2, MOTHER: 3, MOTHER_IN_LAW: 3, SON: 4, DAUGHTER: 5, OTHER: 6 }

function relClass(rel) {
  switch (rel) {
    case 'HEAD':
      return 'member-head'
    case 'SPOUSE':
      return 'member-spouse'
    case 'SON':
    case 'DAUGHTER':
      return 'member-child'
    case 'FATHER':
    case 'MOTHER':
    case 'MOTHER_IN_LAW':
      return 'member-parent'
    default:
      return 'member-other'
  }
}

export default function MyFamily() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'gu' ? 'gu' : 'en'
  const profile = loadCitizenProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const urlTab = searchParams.get('tab')
    return ['members', 'income', 'schemes'].includes(urlTab) ? urlTab : 'members'
  })
  const [memberSort, setMemberSort] = useState({ field: 'relationship', dir: 'asc' })
  const [schemeSort, setSchemeSort] = useState({ field: 'schemeName', dir: 'asc' })
  const [family, setFamily] = useState(null)
  const [income, setIncome] = useState(null)
  const [enrolled, setEnrolled] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [profileTarget, setProfileTarget] = useState(null)
  const [profileRequireOtp, setProfileRequireOtp] = useState(false)
  const [accessDenied, setAccessDenied] = useState(null)

  useEffect(() => {
    if (!profile?.familyId) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [fam, inc, ben] = await Promise.all([
          fetchFamily(profile.familyId),
          fetchFamilyIncome(profile.familyId),
          fetchFamilyBeneficiaries(profile.familyId),
        ])
        if (cancelled) return
        setFamily(fam)
        setIncome(inc)
        setEnrolled(ben)
      } catch {
        if (!cancelled) setError(t('myFamilyPage.loadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [profile?.familyId, t])

  const members = [...(family?.members || [])].sort(
    (a, b) => (REL_ORDER[a.relationshipToHead] ?? 99) - (REL_ORDER[b.relationshipToHead] ?? 99)
  )

  const viewerIsHead = isHouseholdHead(profile?.aadhaarRef, members)

  function setFamilyTab(key) {
    setTab(key)
    const next = new URLSearchParams(searchParams)
    if (key === 'members') next.delete('tab')
    else next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  function handleMemberClick(member) {
    setAccessDenied(null)
    const access = canOpenProfile(profile.aadhaarRef, member, members)
    if (!access.allowed) {
      if (access.reason === 'notHead') {
        setAccessDenied(t('myFamilyPage.accessDenied'))
      }
      return
    }
    setProfileRequireOtp(access.reason === 'otpRequired')
    setProfileTarget(member)
  }

  function memberCanView(member) {
    return canOpenProfile(profile.aadhaarRef, member, members).allowed
  }

  if (!profile?.familyId) {
    return (
      <div className="card form-card">
        <h1 className="page-title">{t('myFamilyPage.title')}</h1>
        <p className="muted">{t('myFamilyPage.loginRequired')}</p>
      </div>
    )
  }

  return (
    <div className="my-family-screen">
      <h1 className="page-title">{t('myFamilyPage.title')}</h1>
      <p className="muted my-family-sub">
        {t('myFamilyPage.loggedInAs', { name: profile.name })}
        {family && (
          <span>
            {' '}
            · {family.rationCardNumber ? `${t('consents.rationCardNumber')} ${family.rationCardNumber}` : ''}
            {family.rationCardNumber ? ' · ' : ''}
            {family.village}, {family.taluka}, {family.district}
          </span>
        )}
      </p>
      {viewerIsHead && (
        <p className="my-family-head-hint">{t('myFamilyPage.headHint')}</p>
      )}
      {!viewerIsHead && (
        <p className="my-family-head-hint muted">{t('myFamilyPage.selfOnlyHint')}</p>
      )}

      {loading && <p className="muted">{t('myFamilyPage.loading')}</p>}
      {error && <div className="error-banner">{error}</div>}
      {accessDenied && <div className="error-banner">{accessDenied}</div>}

      {!loading && !error && family && (
        <>
          <div className="family-tabs">
            {['members', 'income', 'schemes'].map((key) => (
              <button
                key={key}
                type="button"
                className={tab === key ? 'family-tab active' : 'family-tab'}
                onClick={() => setFamilyTab(key)}
              >
                {t(`myFamilyPage.tabs.${key}`)}
              </button>
            ))}
          </div>

          {tab === 'members' && (() => {
            const mul = memberSort.dir === 'asc' ? 1 : -1
            const sortedMembers = [...members].sort((a, b) => {
              if (memberSort.field === 'name')         return mul * (a.name || '').localeCompare(b.name || '')
              if (memberSort.field === 'age')          return mul * ((ageFromDob(a.dob) ?? 0) - (ageFromDob(b.dob) ?? 0))
              if (memberSort.field === 'occupation')   return mul * (a.occupation || '').localeCompare(b.occupation || '')
              if (memberSort.field === 'income')       return mul * ((a.annualIncome || 0) - (b.annualIncome || 0))
              if (memberSort.field === 'caste')        return mul * (a.casteCategory || '').localeCompare(b.casteCategory || '')
              return mul * ((REL_ORDER[a.relationshipToHead] ?? 99) - (REL_ORDER[b.relationshipToHead] ?? 99))
            })
            function thSort(field, label) {
              const active = memberSort.field === field
              const icon = !active ? ' ↕' : memberSort.dir === 'asc' ? ' ↑' : ' ↓'
              return (
                <button className={`th-sort${active ? ' active' : ''}`}
                  onClick={() => setMemberSort(s => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))}>
                  {label}{icon}
                </button>
              )
            }
            return (
              <div className="complaints-table-wrap card">
                <table className="complaints-table">
                  <thead>
                    <tr>
                      <th>{thSort('name', t('myFamilyPage.col.name'))}</th>
                      <th>{thSort('relationship', t('myFamilyPage.col.relationship'))}</th>
                      <th>{thSort('age', t('myFamilyPage.col.age'))}</th>
                      <th>{thSort('occupation', t('myFamilyPage.col.occupation'))}</th>
                      <th>{thSort('income', t('myFamilyPage.col.annualIncome'))}</th>
                      <th>{thSort('caste', t('myFamilyPage.col.caste'))}</th>
                      <th>{t('myFamilyPage.col.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMembers.map((m) => {
                      const self = isSelf(profile.aadhaarRef, m)
                      const deceased = m.isAlive === false
                      const viewable = memberCanView(m)
                      return (
                        <tr
                          key={m.id}
                          className={`complaints-row${viewable ? ' complaints-row--clickable' : ''}${deceased ? ' mydata-deceased' : ''}`}
                          onClick={() => handleMemberClick(m)}
                        >
                          <td>
                            <strong className={deceased ? 'struck' : ''}>{m.name}</strong>
                            {self && <span className="enrollment-you-badge" style={{ marginLeft: '0.5rem' }}>{t('myApps.you')}</span>}
                          </td>
                          <td className="muted">{t('relationships.' + m.relationshipToHead, m.relationshipToHead)}</td>
                          <td className="muted">{ageFromDob(m.dob) ?? '—'} {t('myFamilyPage.years')}</td>
                          <td className="muted">{m.occupation || '—'}</td>
                          <td>₹{(m.annualIncome || 0).toLocaleString('en-IN')}</td>
                          <td className="muted">{m.casteCategory || '—'}</td>
                          <td>
                            {deceased
                              ? <span className="status-badge badge-grey">{t('myFamilyPage.deceased')}</span>
                              : viewable
                                ? <span className="status-badge badge-green">{t('profile360.alive')}</span>
                                : <span className="status-badge badge-grey">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}

          {tab === 'income' && income && (
            <div className="section-card">
              <div className="income-total-display">
                ₹{income.totalAnnualIncome?.toLocaleString('en-IN') ?? 0}
              </div>
              <p className="muted">{t('myFamilyPage.totalIncome')}</p>
              {(income.breakdown || []).map((row) => {
                const alive = family.members.find((mem) => mem.id === row.personId)?.isAlive !== false
                return (
                  <div key={row.personId} className={`income-row-item${alive ? '' : ' deceased'}`}>
                    <span className={alive ? '' : 'struck'}>{row.name}</span>
                    <span>₹{(row.annualIncome || 0).toLocaleString('en-IN')}</span>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'schemes' && (() => {
            const uniqueEnrolled = uniqueSchemeEnrollments(enrolled)
            const availing = uniqueEnrolled.filter((b) => b.status === 'CONFIRMED' || b.status === 'ACTIVE')

            function SchemeTable({ rows, emptyKey }) {
              if (rows.length === 0) return <p className="muted small" style={{ marginTop: '0.5rem' }}>{t(emptyKey)}</p>
              return (
                <div className="complaints-table-wrap">
                  <table className="complaints-table">
                    <thead>
                      <tr>
                        <th>{t('myFamilyPage.col.scheme')}</th>
                        <th>{t('myFamilyPage.col.beneficiary')}</th>
                        <th>{t('myFamilyPage.col.eligibility')}</th>
                        <th>{t('myFamilyPage.col.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => {
                        const criteria = splitReasons(b.eligibilityReason)
                        const isActive = b.status === 'CONFIRMED' || b.status === 'ACTIVE'
                        return (
                          <tr key={b.id}>
                            <td><strong>{b.schemeName}</strong></td>
                            <td className="muted">{b.personName}</td>
                            <td className="muted small">
                              {criteria.slice(0, 4).map((c, i) => (
                                <span key={i} style={{ display: 'block' }}>· {translateCriterion(c, lang)}</span>
                              ))}
                            </td>
                            <td>
                              <span className={`status-badge ${isActive ? 'status-approved' : 'status-pending'}`}>
                                {t('enrollmentStatus.' + b.status, b.status)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="section-card">
                  <h4 style={{ margin: '0 0 0.25rem', color: 'var(--color-primary)' }}>🏛 {t('myFamilyPage.schemesAvailing')}</h4>
                  <p className="muted small" style={{ margin: '0 0 0.75rem' }}>{t('myFamilyPage.schemesAvailingSub')}</p>
                  <SchemeTable rows={availing} emptyKey="myFamilyPage.noAvailing" />
                </div>
                <div className="section-card">
                  <SchemeRecommendations
                    enrollments={uniqueEnrolled}
                    profile={profile}
                    variant="family"
                  />
                </div>
              </div>
            )
          })()}
        </>
      )}

      {profileTarget && (
        <MemberProfile360
          member={profileTarget}
          enrolled={enrolled}
          viewerAadhaar={profile.aadhaarRef}
          requireOtp={profileRequireOtp}
          onClose={() => {
            setProfileTarget(null)
            setProfileRequireOtp(false)
          }}
        />
      )}
    </div>
  )
}

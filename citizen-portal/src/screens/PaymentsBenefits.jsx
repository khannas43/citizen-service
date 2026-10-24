import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { loadCitizenProfile } from '../auth'
import { APIs } from '../api'

const PAGE_SIZE = 10

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatAmount(n) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

function nextCreditDate(frequency) {
  const now = new Date()
  if (frequency === 'MONTHLY' || frequency === 'Monthly') {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  if (frequency === 'ANNUAL' || frequency === 'Annual') {
    return `01 Apr ${now.getFullYear() + 1}`
  }
  return '—'
}

function frequencyLabel(benefitType, t) {
  if (!benefitType) return t('common.oneTime')
  const bt = benefitType.toUpperCase()
  if (bt === 'MONTHLY') return t('common.monthly')
  if (bt === 'ANNUAL') return t('common.annual')
  return t('common.oneTime')
}

const SCHEME_AMOUNTS = {
  'Old Age Pension': 1000,
  'Widow Pension': 1250,
  'Post-Matric OBC Scholarship': 25000,
  'BPL Ration Card': 850,
  'Mukhyamantri Yuva Swavalamban Yojana (MYSY)': 67000,
}

function amount(b) {
  if (b.amount != null && b.amount > 0) return b.amount
  return SCHEME_AMOUNTS[b.schemeName] || 0
}

function inferBenefitType(schemeName) {
  const n = (schemeName || '').toLowerCase()
  if (n.includes('pension') || n.includes('ration')) return 'MONTHLY'
  if (n.includes('scholarship')) return 'ANNUAL'
  return 'ONE_TIME'
}

function isConfirmedEnrollment(b) {
  const status = String(b?.status || '').toUpperCase()
  return status === 'CONFIRMED' || status === 'ACTIVE'
}

function enrollmentKey(b) {
  return `${b.personId || b.personName || ''}|${b.schemeId || b.schemeName || ''}`
}

function uniqueEnrollments(rows) {
  const map = new Map()
  for (const b of rows) {
    const key = enrollmentKey(b)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, b)
      continue
    }
    const newer = new Date(b.disbursedAt || b.confirmedAt || 0).getTime()
    const older = new Date(prev.disbursedAt || prev.confirmedAt || 0).getTime()
    if (newer >= older) map.set(key, b)
  }
  return [...map.values()]
}

function nextCreditSortValue(schemeName) {
  const freq = inferBenefitType(schemeName)
  const now = new Date()
  if (freq === 'MONTHLY') return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
  if (freq === 'ANNUAL') return new Date(now.getFullYear() + 1, 3, 1).getTime()
  return Number.POSITIVE_INFINITY
}

export default function PaymentsBenefits() {
  const { t } = useTranslation()
  const profile = loadCitizenProfile()
  const [beneficiaries, setBeneficiaries] = useState([])
  const [loading, setLoading] = useState(true)

  const months = t('common.months', { returnObjects: true })

  // filters
  const [search, setSearch]       = useState('')
  const [monthFilter, setMonth]   = useState('')
  const [yearFilter, setYear]     = useState('')
  const [statusFilter, setStatus] = useState('ALL')

  // sort
  const [sort, setSort] = useState({ field: 'date', dir: 'desc' })

  // pagination
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!profile?.familyId) { setLoading(false); return }
    fetch(`${APIs.schemeEngine}/v1/beneficiaries/family/${profile.familyId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setBeneficiaries(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [profile?.familyId])

  // Timeline: credited DBT rows + confirmed enrollments awaiting first/next payment
  const allRows = useMemo(() => [
    ...beneficiaries
      .filter((b) => b.disbursementStatus === 'DISBURSED' && b.disbursedAt)
      .map((b) => ({ ...b, _status: 'CREDITED' })),
    ...beneficiaries
      .filter((b) =>
        (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
        b.disbursementStatus !== 'DISBURSED')
      .map((b) => ({ ...b, _status: 'PROCESSING' })),
  ], [beneficiaries])

  // Available years from data
  const availableYears = useMemo(() => {
    const years = new Set(
      allRows
        .filter((b) => b.disbursedAt)
        .map((b) => new Date(b.disbursedAt).getFullYear())
    )
    return [...years].sort((a, b) => b - a)
  }, [allRows])

  // Filtered + sorted rows
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const mul = sort.dir === 'asc' ? 1 : -1

    return allRows
      .filter((b) => {
        if (statusFilter !== 'ALL' && b._status !== statusFilter) return false
        if (monthFilter) {
          if (!b.disbursedAt) return false
          const m = new Date(b.disbursedAt).getMonth() // 0-indexed
          if (m !== parseInt(monthFilter)) return false
        }
        if (yearFilter) {
          if (!b.disbursedAt) return false
          const y = new Date(b.disbursedAt).getFullYear()
          if (String(y) !== yearFilter) return false
        }
        if (q) {
          return (
            (b.schemeName || '').toLowerCase().includes(q) ||
            (b.personName || '').toLowerCase().includes(q) ||
            (b.disbursementRef || '').toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        if (sort.field === 'scheme')    return mul * (a.schemeName || '').localeCompare(b.schemeName || '')
        if (sort.field === 'person')    return mul * (a.personName || '').localeCompare(b.personName || '')
        if (sort.field === 'amount')    return mul * (amount(a) - amount(b))
        if (sort.field === 'ref')       return mul * (a.disbursementRef || '').localeCompare(b.disbursementRef || '')
        if (sort.field === 'status')    return mul * (a._status || '').localeCompare(b._status || '')
        // default: date
        return mul * (new Date(a.disbursedAt || 0) - new Date(b.disbursedAt || 0))
      })
  }, [allRows, search, monthFilter, yearFilter, statusFilter, sort])

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function toggleSort(field) {
    setSort((s) => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  function sortIcon(field) {
    if (sort.field !== field) return ' ↕'
    return sort.dir === 'asc' ? ' ↑' : ' ↓'
  }

  function clearFilters() {
    setSearch(''); setMonth(''); setYear(''); setStatus('ALL'); setPage(1)
  }

  const hasFilter = search || monthFilter || yearFilter || statusFilter !== 'ALL'

  // Summary strip data
  const disbursed = allRows.filter((b) => b._status === 'CREDITED')
  const totalReceived = disbursed.reduce((sum, b) => sum + amount(b), 0)
  // Recurring confirmed schemes stay entitlements after a DBT credit.
  const active = uniqueEnrollments(beneficiaries.filter(isConfirmedEnrollment))
  const activeCount = active.length
  const nextBenefit = [...active]
    .filter((b) => {
      const freq = inferBenefitType(b.schemeName)
      return freq === 'MONTHLY' || freq === 'ANNUAL'
    })
    .sort((a, b) => {
      const byDate = nextCreditSortValue(a.schemeName) - nextCreditSortValue(b.schemeName)
      if (byDate !== 0) return byDate
      const pa = a.schemeName?.toLowerCase().includes('pension') ? 0 : 1
      const pb = b.schemeName?.toLowerCase().includes('pension') ? 0 : 1
      return pa - pb
    })[0]

  return (
    <div className="screen-wrap">
      <h2 className="page-title">💰 {t('payments.title')}</h2>

      {/* ── Summary strip ── */}
      <div className="payments-summary-strip">
        <div className="payments-summary-tile">
          <div className="payments-tile-value">{formatAmount(totalReceived)}</div>
          <div className="payments-tile-label">{t('payments.totalReceived')}</div>
        </div>
        <div className="payments-summary-tile">
          <div className="payments-tile-value">{activeCount}</div>
          <div className="payments-tile-label">{t('payments.activeEnrollments')}</div>
        </div>
        <div className="payments-summary-tile">
          <div className="payments-tile-value payments-tile-value--small">
            {nextBenefit ? nextBenefit.schemeName : '—'}
          </div>
          <div className="payments-tile-label">
            {t('payments.nextExpectedCredit')}
            {nextBenefit && (
              <span className="payments-next-date">
                {' '}· {formatAmount(amount(nextBenefit))} on {nextCreditDate(inferBenefitType(nextBenefit.schemeName))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Benefits Timeline ── */}
      <section className="section-card">
        <div className="payments-timeline-header">
          <h3 className="payments-section-title">📋 {t('payments.timelineTitle')}</h3>
          <p className="muted small">{t('payments.timelineSub')}</p>
        </div>

        {/* ── Toolbar: search + filters ── */}
        <div className="payments-filters-toolbar">
          {/* Search */}
          <div className="apps-search-wrap">
            <span className="apps-search-icon">🔍</span>
            <input
              type="text"
              className="apps-search"
              placeholder={t('payments.searchPlaceholder')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
            {search && (
              <button type="button" className="apps-search-clear" onClick={() => { setSearch(''); setPage(1) }}>✕</button>
            )}
          </div>

          {/* Month */}
          <select
            className="complaints-filter-select payments-filter-select"
            value={monthFilter}
            onChange={(e) => { setMonth(e.target.value); setPage(1) }}
          >
            <option value="">{t('common.allMonths')}</option>
            {(Array.isArray(months) ? months : []).map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>

          {/* Year */}
          <select
            className="complaints-filter-select payments-filter-select"
            value={yearFilter}
            onChange={(e) => { setYear(e.target.value); setPage(1) }}
          >
            <option value="">{t('common.allYears')}</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Status */}
          <select
            className="complaints-filter-select payments-filter-select"
            value={statusFilter}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          >
            <option value="ALL">{t('common.allStatuses')}</option>
            <option value="CREDITED">✅ {t('payments.credited')}</option>
            <option value="PROCESSING">⏳ {t('payments.processing')}</option>
          </select>

          {hasFilter && (
            <button type="button" className="complaints-filter-clear" onClick={clearFilters}>
              ✕ {t('common.clear')}
            </button>
          )}
        </div>

        {loading && <p className="muted">{t('common.loading')}</p>}

        {!loading && filtered.length === 0 && (
          <p className="muted">{t('payments.noMatch')}</p>
        )}

        {!loading && filtered.length > 0 && (
          <>
            <div className="complaints-table-wrap">
              <table className="complaints-table">
                <thead>
                  <tr>
                    <th>
                      <button className={`th-sort${sort.field === 'scheme' ? ' active' : ''}`} onClick={() => toggleSort('scheme')}>
                        {t('payments.scheme')}{sortIcon('scheme')}
                      </button>
                    </th>
                    <th>
                      <button className={`th-sort${sort.field === 'person' ? ' active' : ''}`} onClick={() => toggleSort('person')}>
                        {t('payments.beneficiary')}{sortIcon('person')}
                      </button>
                    </th>
                    <th>
                      <button className={`th-sort${sort.field === 'amount' ? ' active' : ''}`} onClick={() => toggleSort('amount')}>
                        {t('payments.amount')}{sortIcon('amount')}
                      </button>
                    </th>
                    <th>
                      <button className={`th-sort${sort.field === 'date' ? ' active' : ''}`} onClick={() => toggleSort('date')}>
                        {t('payments.date')}{sortIcon('date')}
                      </button>
                    </th>
                    <th>
                      <button className={`th-sort${sort.field === 'ref' ? ' active' : ''}`} onClick={() => toggleSort('ref')}>
                        {t('payments.reference')}{sortIcon('ref')}
                      </button>
                    </th>
                    <th>
                      <button className={`th-sort${sort.field === 'status' ? ' active' : ''}`} onClick={() => toggleSort('status')}>
                        {t('payments.status')}{sortIcon('status')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((b) => (
                    <tr key={b.id}>
                      <td><strong>{b.schemeName}</strong></td>
                      <td>{b.personName}</td>
                      <td>
                        <strong style={{ color: 'var(--color-primary)' }}>{formatAmount(amount(b))}</strong>
                        {b.tuitionAmount != null && (
                          <div className="muted small">
                            Tuition {formatAmount(b.tuitionAmount)} · Boarding {formatAmount(b.boardingAmount)} · Books {formatAmount(b.booksAmount)}
                          </div>
                        )}
                      </td>
                      <td className="muted">{formatDate(b.disbursedAt)}</td>
                      <td><span className="mono-cell small">{b.disbursementRef || '—'}</span></td>
                      <td>
                        {b._status === 'CREDITED'
                          ? <span className="payments-status-pill payments-status-pill--green">✅ {t('payments.credited')}</span>
                          : <span className="payments-status-pill payments-status-pill--amber">⏳ {t('payments.processing')}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            <div className="payments-pagination">
              <span className="muted small">
                {t('payments.showing', {
                  from: (safePage - 1) * PAGE_SIZE + 1,
                  to: Math.min(safePage * PAGE_SIZE, filtered.length),
                  total: filtered.length,
                })}
              </span>
              <div className="payments-pagination-controls">
                <button
                  type="button"
                  className="payments-page-btn"
                  disabled={safePage === 1}
                  onClick={() => setPage(1)}
                >«</button>
                <button
                  type="button"
                  className="payments-page-btn"
                  disabled={safePage === 1}
                  onClick={() => setPage((p) => p - 1)}
                >‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === '…'
                      ? <span key={`ellipsis-${i}`} className="payments-page-ellipsis">…</span>
                      : <button
                          key={p}
                          type="button"
                          className={`payments-page-btn${safePage === p ? ' active' : ''}`}
                          onClick={() => setPage(p)}
                        >{p}</button>
                  )}
                <button
                  type="button"
                  className="payments-page-btn"
                  disabled={safePage === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >›</button>
                <button
                  type="button"
                  className="payments-page-btn"
                  disabled={safePage === totalPages}
                  onClick={() => setPage(totalPages)}
                >»</button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Active Entitlements ── */}
      {active.length > 0 && (
        <section className="section-card">
          <h3 className="payments-section-title">🏛 {t('payments.activeEntitlements')}</h3>
          <p className="muted small" style={{ marginBottom: '1rem' }}>
            {t('payments.activeEntitlementsSub')}
          </p>
          <div className="payments-entitlements">
            {active.map((b) => (
              <div key={b.id} className="payments-entitlement-card">
                <div className="payments-entitlement-scheme">{b.schemeName}</div>
                <div className="payments-entitlement-member muted small">{b.personName}</div>
                <div className="payments-entitlement-meta">
                  <span className="payments-meta-pill">{frequencyLabel(inferBenefitType(b.schemeName), t)}</span>
                  <span className="muted small">{t('payments.next')}: {nextCreditDate(inferBenefitType(b.schemeName))}</span>
                </div>
                <div className="payments-entitlement-amount">
                  {formatAmount(amount(b))}{t('payments.perCycle')}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

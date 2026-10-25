import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { loadCitizenProfile } from '../auth'
import { APIs, certificateDownloadUrl } from '../api'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATIC_CERTS = [
  {
    id: 'static-income',
    type: 'Income Certificate',
    category: 'Revenue',
    certNumber: 'CERT-INCOME-2026-04412',
    issuedBy: 'Mamlatdar Office, Bavla',
    issueDate: '10 Jan 2026',
    validUntil: '09 Jan 2027',
    status: 'APPROVED',
    engineRef: null,
  },
  {
    id: 'static-domicile',
    type: 'Domicile Certificate',
    category: 'Revenue',
    certNumber: 'CERT-DOM-2026-01183',
    issuedBy: 'Mamlatdar Office, Bavla',
    issueDate: '15 Feb 2026',
    validUntil: 'Lifetime',
    status: 'APPROVED',
    engineRef: null,
  },
  {
    id: 'static-marriage',
    type: 'Marriage Certificate',
    category: 'Revenue',
    certNumber: '—',
    issuedBy: 'Bavla Taluka Office',
    issueDate: '—',
    validUntil: 'Lifetime',
    status: 'PENDING',
    engineRef: null,
  },
]

const CATEGORY_OPTIONS = [
  { value: 'All', labelKey: 'certificates.categoryAll' },
  { value: 'Revenue', labelKey: 'certificates.categoryRevenue' },
  { value: 'Welfare', labelKey: 'certificates.categoryWelfare' },
  { value: 'Education', labelKey: 'certificates.categoryEducation' },
]

const CERT_TYPE_KEYS = {
  'Caste Certificate': 'certificates.casteCert',
  'Income Certificate': 'certificates.incomeCert',
  'Domicile Certificate': 'certificates.domicileCert',
  'Marriage Certificate': 'certificates.marriageCert',
}

function displayCertType(type, t) {
  const key = CERT_TYPE_KEYS[type]
  return key ? t(key) : type
}

function displayValidUntil(value, t) {
  return value === 'Lifetime' ? t('common.lifetime') : value
}

function QRCodeSVG({ certNumber }) {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
      <rect width="140" height="140" fill="white" />
      {/* finder pattern TL */}
      <rect x="10" y="10" width="35" height="35" rx="4" fill="#1B3C74" />
      <rect x="17" y="17" width="21" height="21" rx="2" fill="white" />
      <rect x="22" y="22" width="11" height="11" rx="1" fill="#1B3C74" />
      {/* finder pattern TR */}
      <rect x="95" y="10" width="35" height="35" rx="4" fill="#1B3C74" />
      <rect x="102" y="17" width="21" height="21" rx="2" fill="white" />
      <rect x="107" y="22" width="11" height="11" rx="1" fill="#1B3C74" />
      {/* finder pattern BL */}
      <rect x="10" y="95" width="35" height="35" rx="4" fill="#1B3C74" />
      <rect x="17" y="102" width="21" height="21" rx="2" fill="white" />
      <rect x="22" y="107" width="11" height="11" rx="1" fill="#1B3C74" />
      {/* data modules (decorative) */}
      <rect x="55" y="10" width="8" height="8" fill="#1B3C74" />
      <rect x="67" y="10" width="8" height="8" fill="#1B3C74" />
      <rect x="55" y="22" width="8" height="8" fill="#1B3C74" />
      <rect x="55" y="55" width="8" height="8" fill="#1B3C74" />
      <rect x="67" y="67" width="8" height="8" fill="#1B3C74" />
      <rect x="79" y="55" width="8" height="8" fill="#1B3C74" />
      <rect x="67" y="79" width="8" height="8" fill="#1B3C74" />
      <rect x="79" y="67" width="8" height="8" fill="#1B3C74" />
      <rect x="55" y="79" width="8" height="8" fill="#1B3C74" />
      <rect x="79" y="79" width="8" height="8" fill="#1B3C74" />
      <rect x="95" y="55" width="8" height="8" fill="#1B3C74" />
      <rect x="107" y="67" width="8" height="8" fill="#1B3C74" />
      <rect x="119" y="55" width="8" height="8" fill="#1B3C74" />
      <rect x="55" y="95" width="8" height="8" fill="#1B3C74" />
      <rect x="55" y="107" width="8" height="8" fill="#1B3C74" />
      <rect x="67" y="119" width="8" height="8" fill="#1B3C74" />
      <rect x="79" y="107" width="8" height="8" fill="#1B3C74" />
    </svg>
  )
}

function VerifyModal({ cert, onClose }) {
  const { t } = useTranslation()
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="complaints-modal-header">
          <h2 style={{ margin: 0 }}>{t('certificates.verifyTitle')}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <QRCodeSVG certNumber={cert.certNumber} />
          <p className="muted small" style={{ margin: 0 }}>
            {t('certificates.verifyHint')}<br />
            <strong>verify.digitalgujarat.gov.in</strong>
          </p>
          <div className="cert-number-box">{cert.certNumber}</div>
        </div>
      </div>
    </div>
  )
}

function ShareModal({ cert, onClose }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const link = `https://share.digitalgujarat.gov.in/cert/${cert.certNumber}?expires=7d`

  function handleCopy() {
    navigator.clipboard.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="complaints-modal-header">
          <h2 style={{ margin: 0 }}>{t('certificates.shareTitle')}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="muted small" style={{ margin: 0 }}>
            {t('certificates.shareHint')}
          </p>
          <div className="cert-share-link-box">{link}</div>
          <button type="button" className="btn-primary" onClick={handleCopy}>
            {copied ? `✅ ${t('certificates.copied')}` : `📋 ${t('certificates.copyLink')}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MyCertificates() {
  const { t } = useTranslation()
  const profile = loadCitizenProfile()
  const [casteCerts, setCasteCerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [verifyTarget, setVerifyTarget] = useState(null)
  const [shareTarget, setShareTarget] = useState(null)
  const [sort, setSort] = useState({ field: 'type', dir: 'asc' })

  function toggleSort(field) {
    setSort((s) => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))
  }
  function sortIcon(field) {
    if (sort.field !== field) return ' ↕'
    return sort.dir === 'asc' ? ' ↑' : ' ↓'
  }

  useEffect(() => {
    if (!profile?.aadhaarRef) { setLoading(false); return }
    fetch(`${APIs.caste}/v1/applications?aadhaar=${encodeURIComponent(profile.aadhaarRef)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((apps) => {
        const approved = apps
          .filter((a) => a.status === 'APPROVED')
          .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
          .slice(0, 1)
          .map((a) => ({
            id: a.engineRef,
            type: 'Caste Certificate',
            category: 'Revenue',
            certNumber: a.applicationNo || `CERT-CASTE-2026-${a.engineRef?.slice(-5).toUpperCase()}`,
            issuedBy: 'Mamlatdar Office, Bavla',
            issueDate: formatDate(a.updatedAt || a.createdAt),
            validUntil: 'Lifetime',
            status: 'APPROVED',
            engineRef: a.engineRef,
          }))
        setCasteCerts(approved)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [profile?.aadhaarRef])

  const allCerts = [...casteCerts, ...STATIC_CERTS]

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    const mul = sort.dir === 'asc' ? 1 : -1
    return allCerts
      .filter((c) => {
        if (categoryFilter !== 'All' && c.category !== categoryFilter) return false
        if (!q) return true
        return (
          c.type.toLowerCase().includes(q) ||
          c.certNumber.toLowerCase().includes(q) ||
          c.issuedBy.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        if (sort.field === 'certNumber') return mul * a.certNumber.localeCompare(b.certNumber)
        if (sort.field === 'issuedBy')   return mul * a.issuedBy.localeCompare(b.issuedBy)
        if (sort.field === 'issueDate')  return mul * a.issueDate.localeCompare(b.issueDate)
        if (sort.field === 'status')     return mul * a.status.localeCompare(b.status)
        return mul * a.type.localeCompare(b.type)
      })
  }, [allCerts, categoryFilter, search, sort])

  return (
    <div className="screen-wrap">
      <h2 className="page-title">📄 {t('certificates.title')}</h2>

      {/* ── Search + filter ── */}
      <div className="apps-toolbar" style={{ marginBottom: '1.5rem' }}>
        <div className="apps-search-wrap">
          <span className="apps-search-icon">🔍</span>
          <input
            type="text"
            className="apps-search"
            placeholder={t('certificates.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="apps-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
        <div className="cert-filter-pills">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`cert-filter-pill${categoryFilter === opt.value ? ' active' : ''}`}
              onClick={() => setCategoryFilter(opt.value)}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="muted">{t('certificates.loading')}</p>}

      {/* ── Certificate table ── */}
      <div className="complaints-table-wrap card">
        <table className="complaints-table">
          <thead>
            <tr>
              <th>
                <button className={`th-sort${sort.field === 'type' ? ' active' : ''}`} onClick={() => toggleSort('type')}>
                  {t('certificates.type')}{sortIcon('type')}
                </button>
              </th>
              <th>
                <button className={`th-sort${sort.field === 'certNumber' ? ' active' : ''}`} onClick={() => toggleSort('certNumber')}>
                  {t('certificates.certNo')}{sortIcon('certNumber')}
                </button>
              </th>
              <th>
                <button className={`th-sort${sort.field === 'issuedBy' ? ' active' : ''}`} onClick={() => toggleSort('issuedBy')}>
                  {t('certificates.issuedBy')}{sortIcon('issuedBy')}
                </button>
              </th>
              <th>
                <button className={`th-sort${sort.field === 'issueDate' ? ' active' : ''}`} onClick={() => toggleSort('issueDate')}>
                  {t('certificates.issueDate')}{sortIcon('issueDate')}
                </button>
              </th>
              <th>{t('certificates.validUntil')}</th>
              <th>
                <button className={`th-sort${sort.field === 'status' ? ' active' : ''}`} onClick={() => toggleSort('status')}>
                  {t('certificates.status')}{sortIcon('status')}
                </button>
              </th>
              <th>{t('certificates.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: '2rem' }}>
                  {t('certificates.noMatch')}
                </td>
              </tr>
            )}
            {displayed.map((cert) => {
              const isPending = cert.status === 'PENDING'
              return (
                <tr key={cert.id} style={{ opacity: isPending ? 0.65 : 1 }}>
                  <td>
                    <span style={{ marginRight: '0.4rem' }}>
                      {cert.category === 'Education' ? '🎓' : cert.category === 'Welfare' ? '🏛' : '📜'}
                    </span>
                    <strong>{displayCertType(cert.type, t)}</strong>
                  </td>
                  <td><span className="mono-cell small">{cert.certNumber}</span></td>
                  <td className="muted small">{cert.issuedBy}</td>
                  <td className="muted small">{cert.issueDate}</td>
                  <td className="muted small">{displayValidUntil(cert.validUntil, t)}</td>
                  <td>
                    <span className={`cert-status-pill ${isPending ? 'cert-pill--pending' : 'cert-pill--issued'}`}>
                      {isPending ? `⏳ ${t('certificates.pending')}` : `✅ ${t('certificates.issued')}`}
                    </span>
                  </td>
                  <td>
                    {!isPending && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {cert.engineRef
                          ? <a className="cert-action-btn" href={certificateDownloadUrl(cert.engineRef)} download>⬇ {t('certificates.downloadPdf')}</a>
                          : <button type="button" className="cert-action-btn" onClick={() => {
                              const win = window.open('', '_blank', 'width=800,height=600')
                              win.document.write(`<!DOCTYPE html><html><head><title>${cert.type}</title><style>
                                body{font-family:Arial,sans-serif;margin:0;padding:40px;color:#1a1a2e}
                                .header{text-align:center;border-bottom:3px solid #1B3C74;padding-bottom:20px;margin-bottom:24px}
                                .seal{font-size:48px;margin-bottom:8px}
                                .gov{font-size:14px;color:#555;margin:0}
                                h1{color:#1B3C74;font-size:22px;margin:8px 0 0}
                                .body{max-width:600px;margin:0 auto}
                                .row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:10px 0}
                                .lbl{color:#666;font-size:13px}
                                .val{font-weight:bold;font-size:14px}
                                .certno{background:#f0f4ff;border:2px solid #1B3C74;border-radius:6px;text-align:center;padding:16px;margin:20px 0;font-size:18px;font-weight:bold;letter-spacing:2px;color:#1B3C74}
                                .footer{text-align:center;margin-top:30px;font-size:12px;color:#888;border-top:1px solid #ddd;padding-top:16px}
                                @media print{body{padding:20px}}
                              </style></head><body>
                              <div class="body">
                                <div class="header"><div class="seal">🏛</div>
                                  <div class="gov">Government of Gujarat — Citizen Services Portal</div>
                                  <h1>${cert.type}</h1></div>
                                <div class="certno">${cert.certNumber}</div>
                                <div class="row"><span class="lbl">Issued By</span><span class="val">${cert.issuedBy}</span></div>
                                <div class="row"><span class="lbl">Issue Date</span><span class="val">${cert.issueDate}</span></div>
                                <div class="row"><span class="lbl">Valid Until</span><span class="val">${cert.validUntil}</span></div>
                                <div class="row"><span class="lbl">Status</span><span class="val" style="color:#16a34a">✅ ${cert.status}</span></div>
                                <div class="footer">This is a digitally issued certificate. Verify at verify.digitalgujarat.gov.in</div>
                              </div>
                              <script>window.onload=()=>window.print()<\/script>
                              </body></html>`)
                              win.document.close()
                            }}>⬇ {t('certificates.downloadPdf')}</button>
                        }
                        <button type="button" className="cert-action-btn" onClick={() => setShareTarget(cert)}>🔗 {t('certificates.share')}</button>
                        <button type="button" className="cert-action-btn" onClick={() => setVerifyTarget(cert)}>✅ {t('certificates.verify')}</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {verifyTarget && (
        <VerifyModal cert={verifyTarget} onClose={() => setVerifyTarget(null)} />
      )}
      {shareTarget && (
        <ShareModal cert={shareTarget} onClose={() => setShareTarget(null)} />
      )}
    </div>
  )
}

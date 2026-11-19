import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createReport, fetchReportOptions } from '../approvalsApi'

/** The only details a citizen may report: the keys the departments own (ops.ATTR_AUTH). */
export const REPORT_ATTRIBUTES = [
  'name', 'date_of_birth', 'gender', 'life_status', 'address', 'ration_card', 'income',
  'category', 'land', 'marital_status', 'electricity', 'pension', 'scholarship', 'housing',
]

export default function ReportWrongDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [attribute, setAttribute] = useState('')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [current, setCurrent] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    let live = true
    // What the record shows now is read-only and best effort: the form still works without it.
    Promise.resolve()
      .then(() => fetchReportOptions())
      .then((d) => {
        if (!live) return
        const map = {}
        for (const it of (d && d.items) || []) {
          if (REPORT_ATTRIBUTES.includes(it.attribute)) map[it.attribute] = it.current_value
        }
        setCurrent(map)
      })
      .catch((e) => { if (live && e && e.status === 401) navigate('/login') })
    return () => { live = false }
  }, [navigate])

  const canSend = attribute && value.trim() && !busy

  async function send(ev) {
    ev.preventDefault()
    if (!attribute) { setErr(t('approvals.report.detailRequired')); return }
    if (!value.trim()) { setErr(t('approvals.report.valueRequired')); return }
    setBusy(true); setErr('')
    try {
      const out = await createReport({
        attribute,
        reported_value: value.trim(),
        reason: reason.trim() || null,
      })
      setReceipt(out || {})
    } catch (e) {
      if (e.status === 401) { navigate('/login'); return }
      if (e.status === 409) setErr(t('approvals.report.conflict'))
      else setErr(e.detail || t('approvals.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (receipt) {
    const dept = receipt.department
      ? t(`requests.dept.${receipt.department}`, { defaultValue: receipt.department_name || receipt.department })
      : (receipt.department_name || t('approvals.cd.thisDepartment'))
    return (
      <div className="consent-card" data-testid="report-receipt">
        <p style={{ fontSize: '1.5rem', margin: 0 }} aria-hidden="true">✓</p>
        <h2>{t('approvals.report.receiptTitle')}</h2>
        <p>{t('approvals.cd.receiptSent', { dept })}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/approvals/reports" className="btn-primary">{t('approvals.report.menuMine')}</Link>
          <Link to="/approvals" className="btn-secondary">{t('approvals.back')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p><Link to="/approvals">{t('approvals.back')}</Link></p>
      <h1 className="section-heading">{t('approvals.report.title')}</h1>
      <p className="muted">{t('approvals.report.intro')}</p>
      <form onSubmit={send} noValidate>
        <label style={{ display: 'block', marginTop: 12 }}>
          {t('approvals.report.detail')}
          <select
            value={attribute}
            onChange={(e) => setAttribute(e.target.value)}
            style={{ display: 'block', width: '100%' }}
          >
            <option value="">{t('approvals.report.choose')}</option>
            {REPORT_ATTRIBUTES.map((a) => (
              <option key={a} value={a}>{t(`approvals.report.attr.${a}`)}</option>
            ))}
          </select>
        </label>

        {attribute && (
          <div className="consent-meta-row" style={{ marginTop: 12 }} data-testid="report-current">
            <span className="cert-meta-label">{t('approvals.report.recorded')}</span>
            <span className="cert-meta-value">{current[attribute] || t('approvals.report.notShown')}</span>
          </div>
        )}

        <label style={{ display: 'block', marginTop: 12 }}>
          {t('approvals.report.shouldBe')}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ display: 'block', width: '100%' }}
          />
        </label>

        <label style={{ display: 'block', marginTop: 12 }}>
          {t('approvals.report.reason')}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            style={{ display: 'block', width: '100%' }}
          />
        </label>

        <p className="muted small">{t('approvals.report.noDocuments')}</p>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="submit" className="btn-primary" disabled={!canSend}>
            {t('approvals.report.send')}
          </button>
          <Link to="/approvals/reports" className="btn-secondary">{t('approvals.report.menuMine')}</Link>
        </div>
        {err && <p className="muted" role="alert">{err}</p>}
      </form>
    </div>
  )
}

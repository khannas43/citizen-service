import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { fetchApprovals } from '../approvalsApi'

// Consent requests that departments have raised about you (for example, a child's birth).
// Served by the consent engine; only your own requests are ever returned, identified by your sign-in.
const MDM = '/mdm-service/api/citizen'

async function call(path, opts = {}) {
  const token = localStorage.getItem('citizen_token')
  const res = await fetch(`${MDM}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Accept-Language': i18n.language || 'en' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.detail || 'failed'), { status: res.status })
  return body
}

function fmt(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

function RequestCard({ item, onChanged }) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState(new Set(item.elements))
  const [partial, setPartial] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const dept = t(`requests.dept.${item.department}`, { defaultValue: item.department_name })
  const purpose = t(`requests.purposeName.${item.purpose}`, { defaultValue: item.purpose_name })
  const el = (e) => t(`requests.element.${e}`, { defaultValue: e.replace(/_/g, ' ') })
  const pending = item.status === 'PENDING'

  async function act(fn) {
    setBusy(true); setErr('')
    try { await fn(); onChanged() } catch { setErr(t('requests.failed')) } finally { setBusy(false) }
  }
  const agree = () => act(() => call(`/consents/${item.id}/respond`, {
    method: 'POST', body: JSON.stringify({ decision: 'GRANT', elements: partial ? [...picked] : null }),
  }))
  const decline = () => act(() => call(`/consents/${item.id}/respond`, { method: 'POST', body: JSON.stringify({ decision: 'REFUSE' }) }))
  const withdraw = () => act(() => call(`/consents/${item.id}/withdraw`, { method: 'POST' }))
  const shared = item.status === 'GRANTED' ? (item.granted_elements || item.elements) : item.elements

  return (
    <div className={`consent-card${pending ? '' : ' consent-card--revoked'}`}>
      <div className="consent-card-header">
        <div className="consent-card-dept"><span className="consent-dept-icon">🏛</span><strong>{dept}</strong></div>
        <span className={`cert-status-pill ${pending ? 'cert-pill--pending' : item.status === 'GRANTED' ? 'cert-pill--issued' : 'cert-pill--pending'}`}>
          {t(`requests.status.${item.status}`, { defaultValue: item.status })}
        </span>
      </div>
      <div className="consent-meta-grid">
        <div className="consent-meta-row"><span className="cert-meta-label">{t('requests.purpose')}</span><span className="cert-meta-value">{purpose}</span></div>
        {item.about && <div className="consent-meta-row"><span className="cert-meta-label">{t('requests.about')}</span><span className="cert-meta-value">{item.about}</span></div>}
        <div className="consent-meta-row"><span className="cert-meta-label">{t('requests.data')}</span><span className="cert-meta-value">{shared.map(el).join(', ')}</span></div>
        <div className="consent-meta-row"><span className="cert-meta-label">{t('requests.asked')}</span><span className="cert-meta-value">{fmt(item.requested_at)}</span></div>
        <div className="consent-meta-row">
          <span className="cert-meta-label">{t('requests.duration')}</span>
          <span className="cert-meta-value">
            {item.status === 'GRANTED' ? t('requests.until', { date: fmt(item.expires_at) }) : t('requests.days', { count: item.term_days })}
          </span>
        </div>
      </div>

      {pending && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> {t('requests.shareSome')}
          </label>
          {partial && item.elements.map((e) => (
            <label key={e} style={{ display: 'block', marginLeft: 22 }}>
              <input type="checkbox" checked={picked.has(e)} onChange={() => {
                const n = new Set(picked); n.has(e) ? n.delete(e) : n.add(e); setPicked(n)
              }} /> {el(e)}
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn-primary" disabled={busy || (partial && picked.size === 0)} onClick={agree}>{t('requests.agree')}</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={decline}>{t('requests.decline')}</button>
          </div>
        </div>
      )}
      {item.status === 'GRANTED' && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <button type="button" className="btn-secondary" disabled={busy} onClick={withdraw}>{t('requests.withdraw')}</button>
        </div>
      )}
      {err && <p className="muted" role="alert" style={{ color: 'var(--color-danger, #b00020)' }}>{err}</p>}
    </div>
  )
}

export default function RequestsForYou() {
  const { t } = useTranslation()
  const [state, setState] = useState({ loading: true })
  const load = useCallback(() => {
    Promise.all([call('/consents'), fetchApprovals().catch(() => ({ items: [] }))])
      .then(([consents, approvals]) => setState({ data: consents, approvals: approvals.items || [] }))
      .catch((e) => setState({ error: e.status === 404 ? 'unlinked' : 'failed' }))
  }, [])
  useEffect(() => { load() }, [load])

  if (state.loading) return <p className="muted">{t('requests.loading')}</p>
  if (state.error === 'unlinked') return <p className="muted">{t('requests.unlinked')}</p>
  if (state.error) return <p className="muted">{t('requests.failed')}</p>
  const items = state.data.items
  const groups = (state.approvals || []).filter((a) => a.kind === 'CONSENT_GROUP' || a.kind === 'REQUEST')
  return (
    <div>
      <p className="muted">{t('requests.intro')}</p>
      {groups.length > 0 && (
        <p>
          <Link to="/approvals">{t('approvals.openList')}</Link>
        </p>
      )}
      {groups.map((g) => (
        <p key={g.key}>
          <Link to={`/approvals/${g.key}`}>
            {g.kind === 'CONSENT_GROUP'
              ? t('approvals.groupLink', { child: g.child?.name || t('approvals.aChild'), count: g.lines?.length || 0 })
              : g.summary}
          </Link>
        </p>
      ))}
      {items.length === 0 && groups.length === 0 && <p className="muted">{t('requests.none')}</p>}
      {items.map((i) => <RequestCard key={i.id} item={i} onChanged={load} />)}
    </div>
  )
}

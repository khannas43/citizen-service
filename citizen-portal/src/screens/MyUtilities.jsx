import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchUtilities } from '../approvalsApi'
import { fmtDate } from '../approvalsFormat'

const LABELS = {
  kind: { HOUSEHOLD: 'Household', COMMERCIAL: 'Business', INSTITUTION: 'Institution' },
  use: { DOMESTIC: 'Domestic', COMMERCIAL: 'Commercial' },
  benefitType: { FREE_ALLOWANCE: 'Free monthly allowance', REBATE: 'Percentage rebate', FEE_WAIVER: 'One-time fee waiver' },
  status: { ACTIVE: 'Active', GRANTED: 'Granted', PAID: 'Paid', PARTIAL: 'Part paid', UNPAID: 'Unpaid', DISCONNECTED: 'Disconnected' },
}
const lab = (t, group, key) => t(`utilities.${group}.${key}`, { defaultValue: LABELS[group][key] || key })

const rupees = (n) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="consent-meta-row">
      <span className="cert-meta-label">{label}</span>
      <span className="cert-meta-value">{value}</span>
    </div>
  )
}

function Pill({ status, t }) {
  const done = status === 'PAID' || status === 'ACTIVE' || status === 'GRANTED'
  return <span className={`cert-status-pill ${done ? 'cert-pill--issued' : 'cert-pill--pending'}`}>{lab(t, 'status', status)}</span>
}

function Water({ w, t, lang }) {
  const sum = w.passbook.summary
  return (
    <div className="consent-card" data-testid="water-connection">
      <div className="consent-card-header">
        <div className="consent-card-dept"><strong>{t('utilities.waterConn', { defaultValue: 'Water connection' })} {w.service_no}</strong></div>
        <Pill status={w.status} t={t} />
      </div>
      <div className="consent-meta-grid">
        <Row label={t('utilities.holder', { defaultValue: 'Connection in the name of' })} value={w.entity_name} />
        <Row label={t('utilities.type', { defaultValue: 'Type' })} value={`${lab(t, 'kind', w.entity_type)} · ${lab(t, 'use', w.connection_type)}`} />
        <Row label={t('utilities.address', { defaultValue: 'Address' })} value={w.address} />
        <Row label={t('utilities.connectedOn', { defaultValue: 'Connected on' })} value={fmtDate(w.connected_on, lang)} />
        <Row label={t('utilities.pipe', { defaultValue: 'Pipe size' })} value={w.pipe_size_mm ? `${w.pipe_size_mm} mm` : null} />
        <Row label={t('utilities.meter', { defaultValue: 'Meter' })} value={w.meter.status === 'METERED'
          ? `${w.meter.number} · ${w.meter.make} · ${t('utilities.installed', { defaultValue: 'installed' })} ${fmtDate(w.meter.installed_on, lang)}`
          : t('utilities.unmetered', { defaultValue: 'No meter (flat monthly charge)' })} />
      </div>
      <h3 className="section-heading" style={{ marginTop: 16 }}>{t('utilities.passbook', { defaultValue: 'Bill and payment passbook' })}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%' }} aria-label={t('utilities.passbook', { defaultValue: 'Bill and payment passbook' })}>
          <thead>
            <tr>
              <th>{t('utilities.period', { defaultValue: 'Month' })}</th>
              <th>{t('utilities.units', { defaultValue: 'Units (KL)' })}</th>
              <th>{t('utilities.gross', { defaultValue: 'Charged' })}</th>
              <th>{t('utilities.waived', { defaultValue: 'Subsidy' })}</th>
              <th>{t('utilities.payable', { defaultValue: 'To pay' })}</th>
              <th>{t('utilities.paid', { defaultValue: 'Paid' })}</th>
              <th>{t('utilities.paidOn', { defaultValue: 'Paid on' })}</th>
              <th>{t('utilities.state', { defaultValue: 'Status' })}</th>
            </tr>
          </thead>
          <tbody>
            {w.passbook.entries.map((b) => (
              <tr key={b.bill_no}>
                <td>{b.period}</td>
                <td>{b.units_kl}</td>
                <td>{rupees(b.gross_amount)}</td>
                <td>{b.subsidy_waived ? `− ${rupees(b.subsidy_waived)}` : '—'}</td>
                <td>{rupees(b.amount_payable)}</td>
                <td>{rupees(b.paid_amount)}</td>
                <td>{b.paid_on ? fmtDate(b.paid_on, lang) : '—'}</td>
                <td><Pill status={b.status} t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <strong>{t('utilities.outstanding', { defaultValue: 'Outstanding' })}: {rupees(sum.outstanding)}</strong>
        <span className="muted small"> · {t('utilities.totalPaid', { defaultValue: 'Paid' })} {rupees(sum.paid)} · {t('utilities.totalSaved', { defaultValue: 'Saved through subsidy' })} {rupees(sum.subsidy_waived)}</span>
      </p>
      <h3 className="section-heading" style={{ marginTop: 16 }}>{t('utilities.subsidies', { defaultValue: 'Subsidies received' })}</h3>
      {w.subsidies.length === 0 && <p className="muted">{t('utilities.noSubsidy', { defaultValue: 'No subsidy on this connection.' })}</p>}
      {w.subsidies.map((s) => (
        <div className="consent-meta-grid" key={s.claim_id} style={{ marginBottom: 8 }}>
          <Row label={t('utilities.scheme', { defaultValue: 'Scheme' })} value={s.scheme_name} />
          <Row label={t('utilities.benefit', { defaultValue: 'Benefit' })} value={lab(t, 'benefitType', s.benefit_type)} />
          <Row label={t('utilities.coverage', { defaultValue: 'Period' })} value={s.from === s.to ? fmtDate(s.from, lang) : `${fmtDate(s.from, lang)} – ${fmtDate(s.to, lang)}`} />
          <Row label={t('utilities.amount', { defaultValue: 'Amount waived' })} value={rupees(s.amount_waived)} />
          <Row label={t('utilities.state', { defaultValue: 'Status' })} value={<Pill status={s.status} t={t} />} />
        </div>
      ))}
    </div>
  )
}

function Electricity({ e, t }) {
  return (
    <div className="consent-card" data-testid="electricity-connection">
      <div className="consent-card-header">
        <div className="consent-card-dept"><strong>{t('utilities.elecConn', { defaultValue: 'Electricity connection' })} {e.service_no}</strong></div>
        <Pill status={e.status} t={t} />
      </div>
      <div className="consent-meta-grid">
        <Row label={t('utilities.holder', { defaultValue: 'Connection in the name of' })} value={e.consumer_name} />
        <Row label={t('utilities.type', { defaultValue: 'Type' })} value={lab(t, 'use', e.category)} />
        <Row label={t('utilities.load', { defaultValue: 'Connected load' })} value={e.load_kw ? `${e.load_kw} kW` : null} />
        <Row label={t('utilities.address', { defaultValue: 'Address' })} value={e.address} />
        <Row label={t('utilities.last6', { defaultValue: 'Units used, last 6 months' })} value={e.units_last_6_months.join(' · ')} />
      </div>
    </div>
  )
}

export default function MyUtilities() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true })

  const load = useCallback(() => {
    fetchUtilities()
      .then((d) => setState({ data: d }))
      .catch((e) => {
        if (e.status === 401) { navigate('/login'); return }
        setState({ error: e.status === 404 ? 'unlinked' : 'failed' })
      })
  }, [navigate])

  useEffect(() => { load() }, [load])

  if (state.loading) return <p className="muted">{t('approvals.loading')}</p>
  if (state.error === 'unlinked') return <p className="muted">{t('requests.unlinked')}</p>
  if (state.error) {
    return (
      <div>
        <p className="muted" role="alert">{t('approvals.failed')}</p>
        <button type="button" className="btn-secondary" onClick={load}>{t('approvals.retry')}</button>
      </div>
    )
  }

  const d = state.data
  return (
    <div>
      <h1 className="section-heading">{t('utilities.title', { defaultValue: 'My water and electricity' })}</h1>
      <p className="muted">{t('utilities.intro', { defaultValue: 'What the electricity and water departments hold about your connections, your bills and any subsidy you receive.' })}</p>
      <div className="consent-card" data-testid="my-address">
        <div className="consent-card-header"><div className="consent-card-dept"><strong>{t('utilities.addressTitle', { defaultValue: 'Your address on record' })}</strong></div></div>
        <div className="consent-meta-grid">
          <Row label={t('utilities.master', { defaultValue: 'Address' })} value={d.address.master || t('utilities.noAddress', { defaultValue: 'No address on record yet' })} />
          {d.address.held_by.map((h) => <Row key={`${h.department}-${h.address}`} label={h.department} value={h.address} />)}
        </div>
      </div>
      <h2 className="section-heading">{t('utilities.electricity', { defaultValue: 'Electricity' })}</h2>
      {d.electricity.length === 0 && <p className="muted">{t('utilities.noElectricity', { defaultValue: 'No electricity connection is recorded in your name.' })}</p>}
      {d.electricity.map((e) => <Electricity key={e.service_no} e={e} t={t} />)}
      <h2 className="section-heading">{t('utilities.water', { defaultValue: 'Water' })}</h2>
      {d.water.length === 0 && <p className="muted">{t('utilities.noWater', { defaultValue: 'No water connection is recorded in your name.' })}</p>}
      {d.water.map((w) => <Water key={w.service_no} w={w} t={t} lang={i18n.language} />)}
      <p className="muted small">{d.note}</p>
    </div>
  )
}

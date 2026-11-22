import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchUtilities } from '../approvalsApi'
import { fmtDate } from '../approvalsFormat'
import './MyUtilities.css'

const LABELS = {
  kind: { HOUSEHOLD: 'Household', COMMERCIAL: 'Business', INSTITUTION: 'Institution' },
  use: { DOMESTIC: 'Domestic', COMMERCIAL: 'Commercial' },
  benefitType: { FREE_ALLOWANCE: 'Free monthly allowance', REBATE: 'Percentage rebate', FEE_WAIVER: 'One-time fee waiver' },
  status: { ACTIVE: 'Active', GRANTED: 'Granted', PAID: 'Paid', PARTIAL: 'Part paid', UNPAID: 'Unpaid', DISCONNECTED: 'Disconnected' },
  level: { LOW: 'Low sensitivity', MEDIUM: 'Medium sensitivity', HIGH: 'High sensitivity' },
}
const lab = (t, group, key) => t(`utilities.${group}.${key}`, { defaultValue: LABELS[group][key] || key })
const TONE = { PAID: 'ok', ACTIVE: 'ok', GRANTED: 'ok', PARTIAL: 'warn', UNPAID: 'bad', DISCONNECTED: 'bad' }
const LEVEL_TONE = { LOW: 'ok', MEDIUM: 'warn', HIGH: 'bad' }
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const MONEY = new Set(['Total billed', 'Total paid', 'Outstanding', 'Total subsidy received'])
const ISO = /^\d{4}-\d{2}-\d{2}$/
const showValue = (f, t, lang) => {
  const v = f.value
  if (typeof v === 'number' && MONEY.has(f.label)) return rupees(v)
  if (typeof v === 'string' && ISO.test(v)) return fmtDate(v, lang)
  if (typeof v === 'string' && LABELS.status[v]) return lab(t, 'status', v)
  if (typeof v === 'string' && LABELS.use[v] && /type|category/i.test(f.label)) return lab(t, 'use', v)
  return String(v)
}
const monthName = (p, lang) => new Date(`${p}-01`).toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-GB', { month: 'short', year: 'numeric' })

function Pill({ status, t }) {
  return <span className={`ut-pill ${TONE[status] || 'info'}`}>{lab(t, 'status', status)}</span>
}

function Facts({ items }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== '')
  return <dl className="ut-kv">{shown.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
}

function Elements({ list, t, lang }) {
  return (
    <section aria-label={t('utilities.heldTitle', { defaultValue: 'Details supplied by the department' })}>
      <h3 className="ut-h3">{t('utilities.heldTitle', { defaultValue: 'Details supplied by the department' })}</h3>
      <div className="ut-els">
        {list.map((el) => (
          <div className="ut-el" key={el.element} data-testid="data-element">
            <div className="ut-el-top">
              <strong>{el.name}</strong>
              <span className={`ut-pill ${LEVEL_TONE[el.sensitivity] || 'info'}`}>{lab(t, 'level', el.sensitivity)}</span>
            </div>
            <p className="ut-el-src">{t('utilities.from', { defaultValue: 'From' })} {el.source}{el.as_of ? ` · ${t('utilities.asOf', { defaultValue: 'as of' })} ${fmtDate(el.as_of, lang)}` : ''}</p>
            <dl>
              {el.fields.map((f) => (
                <div key={f.label} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{showValue(f, t, lang)}</dd></div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  )
}

function Passbook({ w, t, lang }) {
  const sum = w.passbook.summary
  const due = sum.outstanding > 0
  return (
    <section aria-label={t('utilities.passbook', { defaultValue: 'Bill and payment passbook' })}>
      <h3 className="ut-h3">{t('utilities.passbook', { defaultValue: 'Bill and payment passbook' })}</h3>
      <div className="ut-tiles">
        <div className="ut-tile"><span>{t('utilities.billed', { defaultValue: 'Billed' })}</span><strong>{rupees(sum.billed)}</strong></div>
        <div className="ut-tile"><span>{t('utilities.totalPaid', { defaultValue: 'Paid' })}</span><strong>{rupees(sum.paid)}</strong></div>
        <div className={`ut-tile ${due ? 'due' : 'clear'}`}><span>{t('utilities.outstanding', { defaultValue: 'Outstanding' })}</span><strong>{due ? rupees(sum.outstanding) : t('utilities.nothingDue', { defaultValue: 'Nothing due' })}</strong></div>
        <div className="ut-tile saved"><span>{t('utilities.totalSaved', { defaultValue: 'Saved through subsidy' })}</span><strong>{rupees(sum.subsidy_waived)}</strong></div>
      </div>
      <div className="ut-pass" style={{ marginTop: 14 }}>
        <div className="ut-pass-bar">
          <strong>{t('utilities.account', { defaultValue: 'Account' })} {w.service_no}</strong>
          <span>{w.entity_name} · {sum.last_paid_on ? `${t('utilities.lastPaid', { defaultValue: 'Last payment' })} ${fmtDate(sum.last_paid_on, lang)}` : t('utilities.noPayment', { defaultValue: 'No payment yet' })}</span>
        </div>
        <div className="ut-scroll">
          <table className="ut-table" aria-label={t('utilities.passbook', { defaultValue: 'Bill and payment passbook' })}>
            <thead>
              <tr>
                <th>{t('utilities.period', { defaultValue: 'Month' })}</th>
                <th className="num">{t('utilities.units', { defaultValue: 'Units (KL)' })}</th>
                <th className="num">{t('utilities.gross', { defaultValue: 'Charged' })}</th>
                <th className="num">{t('utilities.waived', { defaultValue: 'Subsidy' })}</th>
                <th className="num">{t('utilities.payable', { defaultValue: 'To pay' })}</th>
                <th className="num">{t('utilities.paid', { defaultValue: 'Paid' })}</th>
                <th>{t('utilities.paidOn', { defaultValue: 'Paid on' })}</th>
                <th className="num">{t('utilities.balance', { defaultValue: 'Balance' })}</th>
                <th>{t('utilities.state', { defaultValue: 'Status' })}</th>
              </tr>
            </thead>
            <tbody>
              {w.passbook.entries.map((b) => (
                <tr key={b.bill_no}>
                  <td><strong>{monthName(b.period, lang)}</strong><span className="ref">{b.bill_no}</span></td>
                  <td className="num">{b.units_kl}</td>
                  <td className="num">{rupees(b.gross_amount)}</td>
                  <td className="num neg">{b.subsidy_waived ? `− ${rupees(b.subsidy_waived)}` : '—'}</td>
                  <td className="num">{rupees(b.amount_payable)}</td>
                  <td className="num">{rupees(b.paid_amount)}{b.receipt_no && <span className="ref">{b.receipt_no}</span>}</td>
                  <td>{b.paid_on ? <>{fmtDate(b.paid_on, lang)}<span className="ref">{b.payment_mode}</span></> : '—'}</td>
                  <td className={`num ${b.balance > 0 ? 'bal-due' : ''}`}>{rupees(b.balance)}</td>
                  <td><Pill status={b.status} t={t} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>{t('utilities.totals', { defaultValue: 'Totals' })}</td>
                <td className="num">{rupees(sum.billed)}</td>
                <td className="num">{rupees(sum.paid)}</td>
                <td />
                <td className={`num ${due ? 'bal-due' : ''}`}>{rupees(sum.outstanding)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  )
}

function Subsidies({ w, t, lang }) {
  return (
    <section aria-label={t('utilities.subsidies', { defaultValue: 'Subsidies received' })}>
      <h3 className="ut-h3">{t('utilities.subsidies', { defaultValue: 'Subsidies received' })}</h3>
      {w.subsidies.length === 0 && <p className="ut-note">{t('utilities.noSubsidy', { defaultValue: 'No subsidy on this connection.' })}</p>}
      <div className="ut-subs">
        {w.subsidies.map((s) => (
          <div className="ut-sub-card" key={s.claim_id}>
            <strong>{s.scheme_name}</strong>
            <span className="amt">{rupees(s.amount_waived)}</span>
            <div><small>{lab(t, 'benefitType', s.benefit_type)} · {s.from === s.to ? fmtDate(s.from, lang) : `${fmtDate(s.from, lang)} – ${fmtDate(s.to, lang)}`}</small></div>
            <div style={{ marginTop: 6 }}><Pill status={s.status} t={t} /></div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Water({ w, t, lang }) {
  return (
    <article className="ut-card" data-testid="water-connection">
      <header className="ut-head">
        <div>
          <h3 className="ut-title">{t('utilities.waterConn', { defaultValue: 'Water connection' })} {w.service_no}</h3>
          <p className="ut-sub">{w.entity_name} · {lab(t, 'kind', w.entity_type)} · {lab(t, 'use', w.connection_type)}</p>
        </div>
        <Pill status={w.status} t={t} />
      </header>
      <div className="ut-body">
        <Facts items={[
          [t('utilities.address', { defaultValue: 'Address' }), w.address],
          [t('utilities.connectedOn', { defaultValue: 'Connected on' }), fmtDate(w.connected_on, lang)],
          [t('utilities.pipe', { defaultValue: 'Pipe size' }), w.pipe_size_mm ? `${w.pipe_size_mm} mm` : null],
          [t('utilities.meter', { defaultValue: 'Meter' }), w.meter.status === 'METERED' ? `${w.meter.number} · ${w.meter.make}` : t('utilities.unmetered', { defaultValue: 'No meter (flat monthly charge)' })],
        ]} />
        <Passbook w={w} t={t} lang={lang} />
        <Subsidies w={w} t={t} lang={lang} />
        <Elements list={w.elements || []} t={t} lang={lang} />
        <p className="ut-note">{t('utilities.sample', { defaultValue: 'Sample data for demonstration. Tariffs and schemes are illustrative.' })}</p>
      </div>
    </article>
  )
}

function Electricity({ e, t, lang }) {
  return (
    <article className="ut-card" data-testid="electricity-connection">
      <header className="ut-head">
        <div>
          <h3 className="ut-title">{t('utilities.elecConn', { defaultValue: 'Electricity connection' })} {e.service_no}</h3>
          <p className="ut-sub">{e.consumer_name} · {lab(t, 'use', e.category)}</p>
        </div>
        <Pill status={e.status} t={t} />
      </header>
      <div className="ut-body">
        <Facts items={[
          [t('utilities.address', { defaultValue: 'Address' }), e.address],
          [t('utilities.load', { defaultValue: 'Connected load' }), e.load_kw ? `${e.load_kw} kW` : null],
          [t('utilities.last6', { defaultValue: 'Units used, last 6 months' }), e.units_last_6_months.join(' · ')],
        ]} />
        <Elements list={e.elements || []} t={t} lang={lang} />
      </div>
    </article>
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
  const lang = i18n.language
  return (
    <div className="ut">
      <div>
        <h1 className="section-heading">{t('utilities.title', { defaultValue: 'My water and electricity' })}</h1>
        <p className="ut-lead">{t('utilities.intro', { defaultValue: 'What the electricity and water departments hold about your connections, your bills and any subsidy you receive.' })}</p>
      </div>
      <article className="ut-card" data-testid="my-address">
        <header className="ut-head">
          <div>
            <h3 className="ut-title">{t('utilities.addressTitle', { defaultValue: 'Your address on record' })}</h3>
            <p className="ut-sub">{d.address.master || t('utilities.noAddress', { defaultValue: 'No address on record yet' })}</p>
          </div>
        </header>
        {d.address.held_by.length > 0 && (
          <div className="ut-body">
            <h3 className="ut-h3" style={{ margin: 0 }}>{t('utilities.heldBy', { defaultValue: 'Addresses held by departments' })}</h3>
            <Facts items={d.address.held_by.map((h) => [h.department, h.address])} />
          </div>
        )}
      </article>
      <div className="ut-sec"><h2>{t('utilities.electricity', { defaultValue: 'Electricity' })}</h2></div>
      {d.electricity.length === 0 && <p className="ut-note">{t('utilities.noElectricity', { defaultValue: 'No electricity connection is recorded in your name.' })}</p>}
      {d.electricity.map((e) => <Electricity key={e.service_no} e={e} t={t} lang={lang} />)}
      <div className="ut-sec"><h2>{t('utilities.water', { defaultValue: 'Water' })}</h2></div>
      {d.water.length === 0 && <p className="ut-note">{t('utilities.noWater', { defaultValue: 'No water connection is recorded in your name.' })}</p>}
      {d.water.map((w) => <Water key={w.service_no} w={w} t={t} lang={lang} />)}
      <p className="ut-note">{d.note}</p>
    </div>
  )
}

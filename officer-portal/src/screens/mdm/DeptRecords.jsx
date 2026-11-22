import { useState } from 'react'
import { useMdm, Status } from './shared'
import { tr } from '../../i18n/lang'
import { fmtDate } from './labels'
import './deptrecords.css'

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const monthName = (p) => { const d = new Date(`${p}-01`); return Number.isNaN(d.getTime()) ? p : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }
const show = (v, type) => (v === null || v === undefined || v === '' ? '—' : type === 'money' ? rupees(v) : type === 'date' ? fmtDate(v) : String(v))
const Pill = ({ s }) => <span className={`ut-pill ${s?.tone || 'info'}`}>{s?.label}</span>

function Cell({ c, row }) {
  const v = row[c.key]
  const sub = c.sub && row[c.sub] ? <span className="ref">{row[c.sub]}</span> : null
  switch (c.type) {
    case 'month': return <td><strong>{monthName(v)}</strong>{sub}</td>
    case 'num': return <td className="num">{v ?? '—'}</td>
    case 'money': return <td className="num">{rupees(v)}{sub}</td>
    case 'waive': return <td className="num neg">{v ? `− ${rupees(v)}` : '—'}</td>
    case 'date': return <td>{v ? <>{fmtDate(v)}{sub}</> : '—'}</td>
    case 'balance': return <td className={`num ${v > 0 ? 'bal-due' : ''}`}>{rupees(v)}</td>
    case 'status': return <td><Pill s={v} />{sub}</td>
    default: return <td>{v ?? '—'}{sub}</td>
  }
}

function Ledger({ l }) {
  return (
    <section aria-label={l.title}>
      <h3 className="ut-h3">{l.title}</h3>
      {l.tiles?.length > 0 && <div className="ut-tiles">{l.tiles.map((x) => <div key={x.label} className={`ut-tile ${x.tone || ''}`}><span>{x.label}</span><strong>{show(x.value, x.type)}</strong></div>)}</div>}
      <div className="ut-pass" style={{ marginTop: l.tiles?.length ? 12 : 0 }}>
        {l.bar && <div className="ut-pass-bar"><strong>{l.bar.left}</strong><span>{l.bar.right_date ? `${l.bar.right_label} ${fmtDate(l.bar.right_date)}` : ''}</span></div>}
        <div className="ut-scroll">
          <table className="ut-table" aria-label={l.title}>
            <thead><tr>{l.columns.map((c) => <th key={c.key} className={['num', 'money', 'waive', 'balance'].includes(c.type) ? 'num' : ''}>{c.label}</th>)}</tr></thead>
            <tbody>{l.rows.map((r, i) => <tr key={i}>{l.columns.map((c) => <Cell key={c.key} c={c} row={r} />)}</tr>)}</tbody>
            {Object.keys(l.totals || {}).length > 0 && (
              <tfoot><tr>{l.columns.map((c, i) => (i === 0 ? <td key={c.key}>{tr('Totals')}</td> : <td key={c.key} className={c.type === 'balance' && l.totals[c.key] > 0 ? 'num bal-due' : 'num'}>{l.totals[c.key] !== undefined ? rupees(l.totals[c.key]) : ''}</td>))}</tr></tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  )
}

function Account({ a, open, toggle }) {
  const body = `dr-body-${a.source}-${a.id}`
  return (
    <article className="ut-card" data-testid="dept-account">
      <button type="button" className="ut-head ut-head-btn" aria-expanded={open} aria-controls={body} onClick={toggle}>
        <span className="ut-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="ut-head-text"><span className="ut-title">{a.title}</span><span className="ut-sub">{a.subtitle}</span></span>
        <Pill s={a.status} />
      </button>
      {open && (
      <div className="ut-body" id={body}>
        {a.facts.length > 0 && <dl className="ut-kv">{a.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{show(f.value, f.type)}</dd></div>)}</dl>}
        {a.ledgers.map((l) => <Ledger key={l.title} l={l} />)}
        {a.benefits.length > 0 && (
          <section><h3 className="ut-h3">{tr('Benefits received')}</h3>
            <div className="ut-subs">{a.benefits.map((b, i) => (
              <div className="ut-sub-card" key={i}><strong>{b.scheme}</strong><span className="amt">{rupees(b.amount)}</span>
                <div><small>{b.kind}{b.from ? ` · ${fmtDate(b.from)}${b.to && b.to !== b.from ? ` – ${fmtDate(b.to)}` : ''}` : ''}</small></div><div style={{ marginTop: 6 }}><Pill s={b.status} /></div></div>))}</div>
          </section>
        )}
        {a.elements.length > 0 && (
          <section><h3 className="ut-h3">{tr('Catalogue elements this department supplied')}</h3>
            <div className="ut-els">{a.elements.map((el) => (
              <div className="ut-el" key={el.element} data-testid="data-element">
                <div className="ut-el-top"><strong>{el.name}</strong></div>
                <p className="ut-el-src">{tr('From')} {el.source}{el.as_of ? ` · ${tr('as of')} ${fmtDate(el.as_of)}` : ''}</p>
                <dl>{el.fields.map((f) => <div key={f.label} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{show(f.value, f.type)}</dd></div>)}</dl>
              </div>))}</div>
          </section>
        )}
      </div>
      )}
    </article>
  )
}

export default function DeptRecords({ personId }) {
  const { data, error, loading } = useMdm(`/persons/${personId}/departments`, undefined, [personId])
  const [open, setOpen] = useState({})
  if (!data) return <Status loading={loading} error={error} />
  if (data.departments.length === 0) return <p className="mdm-sub">{tr('No department has supplied details beyond the basic record for this person.')}</p>
  const keys = data.departments.flatMap((d) => d.accounts.map((a) => `${a.source}-${a.id}`))
  const setAll = (v) => setOpen(Object.fromEntries(keys.map((k) => [k, v])))
  const flip = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const openCount = keys.filter((k) => open[k]).length
  return (
    <div className="dr ut">
      <div className="dr-bar">
        <span className="mdm-sub">{tr('{n} department records', { n: keys.length })}</span>
        <span className="dr-bar-actions">
          <button type="button" className="btn-secondary small" disabled={openCount === keys.length} onClick={() => setAll(true)}>{tr('Expand all')}</button>
          <button type="button" className="btn-secondary small" disabled={openCount === 0} onClick={() => setAll(false)}>{tr('Collapse all')}</button>
        </span>
      </div>
      {data.departments.map((dep) => {
        const ks = dep.accounts.map((a) => `${a.source}-${a.id}`)
        const allOpen = ks.every((k) => open[k])
        return (
          <section key={dep.source} aria-label={dep.department} className="ut">
            <button type="button" className="ut-dept ut-dept-btn" aria-expanded={allOpen} onClick={() => setOpen((o) => ({ ...o, ...Object.fromEntries(ks.map((k) => [k, !allOpen])) }))}>
              <span aria-hidden="true">{dep.icon}</span><h2>{dep.department}</h2><span className="ut-dept-n">{ks.length}</span><span className="ut-chev" aria-hidden="true">{allOpen ? '▾' : '▸'}</span>
            </button>
            {dep.accounts.map((a) => { const k = `${a.source}-${a.id}`; return <Account key={k} a={a} open={!!open[k]} toggle={() => flip(k)} /> })}
          </section>
        )
      })}
      <p className="ut-note">{data.note}</p>
    </div>
  )
}

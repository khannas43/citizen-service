import { useMdm, Status } from './shared'
import { tr } from '../../i18n/lang'
import { fmtDate } from './labels'
import './deptrecords.css'

const LEVEL = { LOW: 'ok', MEDIUM: 'warn', HIGH: 'bad' }
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

function Account({ a }) {
  return (
    <article className="ut-card" data-testid="dept-account">
      <header className="ut-head"><div><h3 className="ut-title">{a.title}</h3><p className="ut-sub">{a.subtitle}</p></div><Pill s={a.status} /></header>
      <div className="ut-body">
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
                <div className="ut-el-top"><strong>{el.name}</strong><span className={`ut-pill ${LEVEL[el.sensitivity] || 'info'}`}>{el.sensitivity.toLowerCase()}</span></div>
                <p className="ut-el-src">{tr('From')} {el.source}{el.as_of ? ` · ${tr('as of')} ${fmtDate(el.as_of)}` : ''}</p>
                <dl>{el.fields.map((f) => <div key={f.label} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{show(f.value, f.type)}</dd></div>)}</dl>
              </div>))}</div>
          </section>
        )}
      </div>
    </article>
  )
}

export default function DeptRecords({ personId }) {
  const { data, error, loading } = useMdm(`/persons/${personId}/departments`, undefined, [personId])
  if (!data) return <Status loading={loading} error={error} />
  if (data.departments.length === 0) return <p className="mdm-sub">{tr('No department has supplied details beyond the basic record for this person.')}</p>
  return (
    <div className="dr ut">
      {data.departments.map((dep) => (
        <section key={dep.source} aria-label={dep.department} className="ut">
          <div className="ut-dept"><span aria-hidden="true">{dep.icon}</span><h2>{dep.department}</h2></div>
          {dep.accounts.map((a) => <Account key={`${a.source}-${a.id}`} a={a} />)}
        </section>
      ))}
      <p className="ut-note">{data.note}</p>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { fmtDate } from '../approvalsFormat'

const TONE = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'info' }
const LEVEL = { LOW: ['ok', 'Low sensitivity'], MEDIUM: ['warn', 'Medium sensitivity'], HIGH: ['bad', 'High sensitivity'] }

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const monthName = (p, lang) => { const d = new Date(`${p}-01`); return Number.isNaN(d.getTime()) ? p : d.toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-GB', { month: 'short', year: 'numeric' }) }

export function show(value, type, lang) {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'money') return rupees(value)
  if (type === 'date') return fmtDate(value, lang)
  return String(value)
}

function Pill({ s }) {
  return <span className={`ut-pill ${TONE[s?.tone] || 'info'}`}>{s?.label}</span>
}

function Tile({ t, lang }) {
  return <div className={`ut-tile ${t.tone || ''}`}><span>{t.label}</span><strong>{t.value === 0 && t.type === 'money' && t.tone === 'clear' ? '—' : show(t.value, t.type, lang)}</strong></div>
}

function Cell({ c, row, lang }) {
  const v = row[c.key]
  const sub = c.sub && row[c.sub] ? <span className="ref">{row[c.sub]}</span> : null
  switch (c.type) {
    case 'month': return <td><strong>{monthName(v, lang)}</strong>{sub}</td>
    case 'num': return <td className="num">{v ?? '—'}</td>
    case 'money': return <td className="num">{rupees(v)}{sub}</td>
    case 'waive': return <td className="num neg">{v ? `− ${rupees(v)}` : '—'}</td>
    case 'date': return <td>{v ? <>{fmtDate(v, lang)}{sub}</> : '—'}</td>
    case 'balance': return <td className={`num ${v > 0 ? 'bal-due' : ''}`}>{rupees(v)}</td>
    case 'status': return <td><Pill s={v} />{sub}</td>
    default: return <td>{v ?? '—'}{sub}</td>
  }
}

function Ledger({ l, lang, t }) {
  const cols = l.columns
  const first = cols[0].key
  return (
    <section aria-label={l.title}>
      <h3 className="ut-h3">{l.title}</h3>
      {l.tiles?.length > 0 && <div className="ut-tiles">{l.tiles.map((x) => <Tile key={x.label} t={x} lang={lang} />)}</div>}
      <div className="ut-pass" style={{ marginTop: l.tiles?.length ? 14 : 0 }}>
        {l.bar && (
          <div className="ut-pass-bar">
            <strong>{l.bar.left}</strong>
            <span>{l.bar.right_date ? `${l.bar.right_label} ${fmtDate(l.bar.right_date, lang)}` : ''}</span>
          </div>
        )}
        <div className="ut-scroll">
          <table className="ut-table" aria-label={l.title}>
            <thead><tr>{cols.map((c) => <th key={c.key} className={['num', 'money', 'waive', 'balance'].includes(c.type) ? 'num' : ''}>{c.label}</th>)}</tr></thead>
            <tbody>{l.rows.map((r, i) => <tr key={i}>{cols.map((c) => <Cell key={c.key} c={c} row={r} lang={lang} />)}</tr>)}</tbody>
            {Object.keys(l.totals || {}).length > 0 && (
              <tfoot>
                <tr>{cols.map((c, i) => (i === 0 ? <td key={c.key}>{t('records.totals', { defaultValue: 'Totals' })}</td>
                  : <td key={c.key} className={c.type === 'balance' && l.totals[c.key] > 0 ? 'num bal-due' : 'num'}>{l.totals[c.key] !== undefined ? rupees(l.totals[c.key]) : ''}</td>))}</tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <span hidden>{first}</span>
    </section>
  )
}

function Benefits({ list, lang, t }) {
  return (
    <section aria-label={t('records.benefits', { defaultValue: 'Benefits received' })}>
      <h3 className="ut-h3">{t('records.benefits', { defaultValue: 'Benefits received' })}</h3>
      <div className="ut-subs">
        {list.map((b, i) => (
          <div className="ut-sub-card" key={i}>
            <strong>{b.scheme}</strong>
            <span className="amt">{rupees(b.amount)}</span>
            <div><small>{b.kind}{b.from ? ` · ${fmtDate(b.from, lang)}${b.to && b.to !== b.from ? ` – ${fmtDate(b.to, lang)}` : ''}` : ''}</small></div>
            <div style={{ marginTop: 6 }}><Pill s={b.status} /></div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function Elements({ list, lang, t }) {
  return (
    <section aria-label={t('records.held', { defaultValue: 'Details supplied by the department' })}>
      <h3 className="ut-h3">{t('records.held', { defaultValue: 'Details supplied by the department' })}</h3>
      <div className="ut-els">
        {list.map((el) => (
          <div className="ut-el" key={el.element} data-testid="data-element">
            <div className="ut-el-top">
              <strong>{el.name}</strong>
              <span className={`ut-pill ${LEVEL[el.sensitivity]?.[0] || 'info'}`}>{LEVEL[el.sensitivity]?.[1] || el.sensitivity}</span>
            </div>
            <p className="ut-el-src">{t('records.from', { defaultValue: 'From' })} {el.source}{el.as_of ? ` · ${t('records.asOf', { defaultValue: 'as of' })} ${fmtDate(el.as_of, lang)}` : ''}</p>
            <dl>{el.fields.map((f) => <div key={f.label} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{show(f.value, f.type, lang)}</dd></div>)}</dl>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function DeptAccount({ a }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return (
    <article className="ut-card" data-testid="dept-account">
      <header className="ut-head">
        <div>
          <h3 className="ut-title">{a.title}</h3>
          <p className="ut-sub">{a.subtitle}</p>
        </div>
        <Pill s={a.status} />
      </header>
      <div className="ut-body">
        {a.facts.length > 0 && <dl className="ut-kv">{a.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{show(f.value, f.type, lang)}</dd></div>)}</dl>}
        {a.ledgers.map((l) => <Ledger key={l.title} l={l} lang={lang} t={t} />)}
        {a.benefits.length > 0 && <Benefits list={a.benefits} lang={lang} t={t} />}
        {a.elements.length > 0 && <Elements list={a.elements} lang={lang} t={t} />}
      </div>
    </article>
  )
}

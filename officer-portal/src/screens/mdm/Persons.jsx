import { useState } from 'react'
import { useMdm, Status, Badge, Pager } from './shared'
import { lifeLabel } from './labels'

export default function Persons({ openPerson }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [life, setLife] = useState('')
  const [issue, setIssue] = useState(false)
  const [multi, setMulti] = useState(false)
  const [offset, setOffset] = useState(0)
  const limit = 25
  const { data, error, loading } = useMdm('/persons', { q: term, life_status: life, has_issue: issue ? 'true' : '', min_sources: multi ? 3 : '', limit, offset }, [term, life, issue, multi, offset])

  const submit = (e) => { e.preventDefault(); setOffset(0); setTerm(q.trim()) }
  return (
    <div className="mdm-stack">
      <form className="mdm-filters" onSubmit={submit} role="search">
        <label className="mdm-field grow">
          <span>Search by name, ration card or record number</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: Goud, TG-RC-00000001, MDM-00000012" />
        </label>
        <label className="mdm-field">
          <span>Life status</span>
          <select value={life} onChange={(e) => { setLife(e.target.value); setOffset(0) }}>
            <option value="">All</option><option value="DECEASED">Death registered</option><option value="NO_DEATH_RECORD">No death record</option>
          </select>
        </label>
        <label className="mdm-check"><input type="checkbox" checked={issue} onChange={(e) => { setIssue(e.target.checked); setOffset(0) }} /> Has open data issues</label>
        <label className="mdm-check"><input type="checkbox" checked={multi} onChange={(e) => { setMulti(e.target.checked); setOffset(0) }} /> In 3 or more systems</label>
        <button type="submit" className="btn-primary small">Search</button>
      </form>
      <Status loading={loading && !data} error={error} />
      {data && (
        <section className="mdm-card flush">
          <div className="mdm-table-wrap">
            <table className="mdm-table">
              <thead><tr><th>Person</th><th>MDM id</th><th>Born</th><th>District</th><th>Life status</th><th className="num">Systems</th><th className="num">Open issues</th></tr></thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button type="button" className="mdm-link strong" onClick={() => openPerson(p.id)}>{p.name || '(no name)'}</button>
                      {p.name_local && <div className="mdm-sub">{p.name_local}</div>}
                    </td>
                    <td><code>{p.mdm_id}</code></td>
                    <td>{p.dob || p.birth_year || '—'}</td>
                    <td>{p.district || '—'}{p.mandal ? <div className="mdm-sub">{p.mandal}</div> : null}</td>
                    <td>{p.life_status === 'DECEASED' ? <Badge tone="bad">{lifeLabel(p.life_status)}</Badge> : <span className="mdm-sub">{lifeLabel(p.life_status)}</span>}</td>
                    <td className="num">{p.source_count}</td>
                    <td className="num">{p.open_issues ? <Badge tone="warn">{p.open_issues}</Badge> : 0}</td>
                  </tr>
                ))}
                {!data.items.length && <tr><td colSpan="7" className="mdm-empty">No people match this search.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
        </section>
      )}
    </div>
  )
}

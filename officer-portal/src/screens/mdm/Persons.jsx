import { useState } from 'react'
import { useMdm, Status, Badge } from './shared'
import { lifeLabel } from './labels'
import { DataTable, FilterSelect } from '../dx/dxKit'

export default function Persons({ openPerson }) {
  const [q, setQ] = useState('')
  const [life, setLife] = useState('')
  const [issue, setIssue] = useState(false)
  const [multi, setMulti] = useState(false)
  const [offset, setOffset] = useState(0)
  const limit = 25
  const { data, error, loading } = useMdm('/persons', { q: q.trim(), life_status: life, has_issue: issue ? 'true' : '', min_sources: multi ? 3 : '', limit, offset }, [q, life, issue, multi, offset])
  const reset = () => { setQ(''); setLife(''); setIssue(false); setMulti(false); setOffset(0) }
  return (
    <div className="mdm-stack">
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={{ total: data.total, limit, offset, onPage: setOffset }}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search by name, ration card or record number' }}
          canClear={!!(q || life || issue || multi)} onClear={reset}
          filters={<>
            <FilterSelect label="Life status" value={life} onChange={(v) => { setLife(v); setOffset(0) }} options={[['DECEASED', 'Death registered'], ['NO_DEATH_RECORD', 'No death record']]} />
            <label className="dxk-check"><input type="checkbox" checked={issue} onChange={(e) => { setIssue(e.target.checked); setOffset(0) }} /> Has open data issues</label>
            <label className="dxk-check"><input type="checkbox" checked={multi} onChange={(e) => { setMulti(e.target.checked); setOffset(0) }} /> In 3 or more systems</label>
          </>}
          onRowClick={(p) => openPerson(p.id)} empty="No people match this search."
          columns={[
            { key: 'name', label: 'Person', render: (p) => <><button type="button" className="mdm-link strong" onClick={(e) => { e.stopPropagation(); openPerson(p.id) }}>{p.name || '(no name)'}</button>{p.name_local && <div className="mdm-sub">{p.name_local}</div>}</> },
            { key: 'mdm_id', label: 'MDM id', render: (p) => <code>{p.mdm_id}</code> },
            { key: 'dob', label: 'Born', render: (p) => p.dob || p.birth_year || '—' },
            { key: 'district', label: 'District', render: (p) => <>{p.district || '—'}{p.mandal ? <div className="mdm-sub">{p.mandal}</div> : null}</> },
            { key: 'life_status', label: 'Life status', render: (p) => p.life_status === 'DECEASED' ? <Badge tone="bad">{lifeLabel(p.life_status)}</Badge> : <span className="mdm-sub">{lifeLabel(p.life_status)}</span> },
            { key: 'source_count', label: 'Systems', align: 'num' },
            { key: 'open_issues', label: 'Open issues', align: 'num', render: (p) => p.open_issues ? <Badge tone="warn">{p.open_issues}</Badge> : 0 },
          ]} />
      )}
    </div>
  )
}

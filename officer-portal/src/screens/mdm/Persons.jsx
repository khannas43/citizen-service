import { useState } from 'react'
import { useMdm, Status, Badge } from './shared'
import { lifeLabel } from './labels'
import { DataTable, FilterSelect } from '../dx/dxKit'
import { tr } from '../../i18n/lang'
import { Name, Nm } from '../../i18n/mt'

const EMPTY = { q: '', district: '', life: '', from: '', to: '', issue: false, multi: false, review: false }

export default function Persons({ openPerson }) {
  const [f, setF] = useState(EMPTY)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(25)
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setOffset(0) }
  const { data: facets } = useMdm('/persons/facets', undefined, [])
  const params = { q: f.q.trim(), district: f.district, life_status: f.life, date_from: f.from, date_to: f.to,
    has_issue: f.issue ? 'true' : '', min_sources: f.multi ? 3 : '', in_review: f.review ? 'true' : '', limit, offset, sort: sort.key, dir: sort.dir }
  const { data, error, loading } = useMdm('/persons', params, [JSON.stringify(params)])
  const any = !!(f.q || f.district || f.life || f.from || f.to || f.issue || f.multi || f.review)
  const reset = () => { setF(EMPTY); setOffset(0) }
  return (
    <div className="mdm-stack">
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items}
          server={{ total: data.total, limit, offset, onPage: setOffset, onLimit: (n) => { setLimit(n); setOffset(0) }, pageSizes: [10, 25, 50, 100],
            sort, onSort: (key, dir) => { setSort({ key, dir }); setOffset(0) } }}
          searchValue={f.q} onSearch={set('q')} searchDelay={300} search={{ placeholder: 'Search by name, ration card or record number' }}
          canClear={any} onClear={reset}
          filters={<>
            <FilterSelect label={tr('District')} value={f.district} onChange={set('district')} all="All districts" options={(facets?.districts || []).map((d) => [d.value, `${d.value} (${d.n.toLocaleString('en-IN')})`])} />
            <FilterSelect label={tr('Life status')} value={f.life} onChange={set('life')} options={[['DECEASED', 'Death registered'], ['NO_DEATH_RECORD', 'No death record']]} />
            <div className="dxk-filter dxk-daterange"><span>{tr('Born between')}</span>
              <div className="dxk-dates">
                <input type="date" value={f.from} max={f.to || undefined} aria-label={tr('Born from')} onChange={(e) => set('from')(e.target.value)} />
                <em>{tr('to')}</em>
                <input type="date" value={f.to} min={f.from || undefined} aria-label={tr('Born to')} onChange={(e) => set('to')(e.target.value)} />
              </div></div>
            <label className="dxk-check"><input type="checkbox" checked={f.issue} onChange={(e) => set('issue')(e.target.checked)} /> {tr('Has open data issues')}</label>
            <label className="dxk-check"><input type="checkbox" checked={f.multi} onChange={(e) => set('multi')(e.target.checked)} /> {tr('In 3 or more systems')}</label>
            <label className="dxk-check"><input type="checkbox" checked={f.review} onChange={(e) => set('review')(e.target.checked)} /> {tr('Waiting for review')}</label>
          </>}
          onRowClick={(p) => openPerson(p.id)} empty={tr('No people match this search.')}
          columns={[
            { key: 'name', sortKey: 'name', label: 'Person', render: (p) => <><button type="button" className="mdm-link strong" onClick={(e) => { e.stopPropagation(); openPerson(p.id) }}>{p.name ? <Name text={p.name} local={p.name_local} /> : '(no name)'}</button></> },
            { key: 'mdm_id', sortKey: 'mdm_id', label: 'MDM id', render: (p) => <code>{p.mdm_id}</code> },
            { key: 'dob', sortKey: 'dob', label: 'Born', render: (p) => p.dob || p.birth_year || '—' },
            { key: 'district', sortKey: 'district', label: 'District', render: (p) => <>{p.district ? <Nm text={p.district} /> : '—'}{p.mandal ? <div className="mdm-sub"><Nm text={p.mandal} /></div> : null}</> },
            { key: 'life_status', sortKey: 'life_status', label: 'Life status', render: (p) => p.life_status === 'DECEASED' ? <Badge tone="bad">{lifeLabel(p.life_status)}</Badge> : <span className="mdm-sub">{lifeLabel(p.life_status)}</span> },
            { key: 'source_count', sortKey: 'source_count', label: 'Systems', align: 'num' },
            { key: 'in_review', sortKey: 'in_review', label: 'Waiting for review', align: 'num', render: (p) => p.in_review ? <Badge tone="warn">{p.in_review}</Badge> : 0 },
            { key: 'open_issues', sortKey: 'open_issues', label: 'Open issues', align: 'num', render: (p) => p.open_issues ? <Badge tone="warn">{p.open_issues}</Badge> : 0 },
          ]} />
      )}
    </div>
  )
}

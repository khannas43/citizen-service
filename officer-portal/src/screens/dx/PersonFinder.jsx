import { useState } from 'react'
import { useMdm, Status, Badge } from '../mdm/shared'
import { lifeLabel } from '../mdm/labels'
import { DataTable, FilterSelect, DateRange, useServerTable } from './dxKit'
import { tr } from '../../i18n/lang'

/** The 33 districts of Telangana, as spelled in the demonstration data. */
export const TG_DISTRICTS = ['Adilabad', 'Bhadradri Kothagudem', 'Hanumakonda', 'Hyderabad', 'Jagitial', 'Jangoan', 'Jayashankar Bhupalapally', 'Jogulamba Gadwal', 'Kamareddy', 'Karimnagar', 'Khammam',
  'Kumuram Bheem Asifabad', 'Mahabubabad', 'Mahabubnagar', 'Mancherial', 'Medak', 'Medchal Malkajgiri', 'Mulugu', 'Nagarkurnool', 'Nalgonda', 'Narayanpet', 'Nirmal', 'Nizamabad', 'Peddapalli',
  'Rajanna Sircilla', 'Ranga Reddy', 'Sangareddy', 'Siddipet', 'Suryapet', 'Vikarabad', 'Wanaparthy', 'Warangal', 'Yadadri Bhuvanagiri']

const EMPTY = { q: '', district: '', min_sources: '', life_status: '', has_issue: '', date_from: '', date_to: '' }

/** Find one person among many with the same name: search by name, ration card or id, and narrow by district, number of systems, status and open issues. */
export default function PersonFinder({ onPick }) {
  const [f, setF] = useState(EMPTY)
  const T = useServerTable(null, 10, [5, 10, 25])
  const { offset, setOffset, limit } = T
  const set = (k) => (v) => { setF((p) => ({ ...p, [k]: v })); setOffset(0) }
  const { data, error, loading } = useMdm('/persons', { ...f, q: f.q.trim(), limit, offset, ...T.sortParams }, [JSON.stringify(f), offset, T.key])
  const any = Object.values(f).some(Boolean)
  return (
    <>
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={T.server(data.total)}
          searchValue={f.q} onSearch={set('q')} searchDelay={300} search={{ placeholder: 'Name, ration card or MDM id' }}
          canClear={any} onClear={() => { setF(EMPTY); setOffset(0) }}
          filters={<>
            <FilterSelect label={tr('District')} value={f.district} onChange={set('district')} options={TG_DISTRICTS} all="Any district" />
            <FilterSelect label={tr('Held by')} value={f.min_sources} onChange={set('min_sources')} all="Any number of systems"
              options={[['2', '2 or more systems'], ['3', '3 or more systems'], ['4', '4 or more systems'], ['5', '5 or more systems']]} />
            <FilterSelect label={tr('Life status')} value={f.life_status} onChange={set('life_status')} all="Any"
              options={[['NO_DEATH_RECORD', 'No death record'], ['DECEASED', 'Death registered']]} />
            <DateRange label={tr('Born between')} from={f.date_from} to={f.date_to} onFrom={set('date_from')} onTo={set('date_to')} />
            <label className="dxk-check"><input type="checkbox" checked={!!f.has_issue} onChange={(e) => set('has_issue')(e.target.checked ? 'true' : '')} /> {tr('Has open data issues')}</label>
          </>}
          onRowClick={onPick} empty={tr('No people match these filters.')}
          columns={[
            { key: 'name', sortKey: 'name', label: 'Person', render: (p) => <><span className="dxk-main">{p.name || '(no name)'}</span><div className="mdm-sub">{p.mdm_id}</div></> },
            { key: 'dob', sortKey: 'dob', label: 'Born', render: (p) => p.dob || p.birth_year || '—' },
            { key: 'district', sortKey: 'district', label: 'Place', render: (p) => <>{p.district || '—'}{p.mandal ? <div className="mdm-sub">{p.mandal}</div> : null}</> },
            { key: 'source_count', sortKey: 'source_count', label: 'Systems', align: 'num' },
            { key: 'life_status', sortKey: 'life_status', label: 'Status', render: (p) => (p.life_status === 'DECEASED' ? <Badge tone="bad">{lifeLabel(p.life_status)}</Badge> : <span className="mdm-sub">{lifeLabel(p.life_status)}</span>) },
            { key: 'go', label: '', sort: false, render: (p) => <button type="button" className="btn-secondary small" onClick={(e) => { e.stopPropagation(); onPick(p) }}>{tr('Select')}</button> },
          ]} />
      )}
    </>
  )
}

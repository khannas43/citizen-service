import { useState } from 'react'
import { useMdm, Status, Badge } from '../mdm/shared'
import { CONSENT } from './dxShared'
import { PageHeader, Card, DataTable, FilterSelect, Segmented, Stats, Drawer, Facts } from './dxKit'
import { tr } from '../../i18n/lang'

const fresh = (h) => (h < 48 ? `${h || 'live'}${h ? ' hours' : ''}` : `${Math.round(h / 24)} days`)
const SENS = { HIGH: 'bad', MEDIUM: 'warn', LOW: 'ok' }

export function SourceTable({ sources }) {
  return (
    <DataTable rows={sources} rowKey="source" pageSize={10} pageSizes={[10, 25]} initialSort={{ key: 'name', dir: 'asc' }}
      search={{ placeholder: 'Search sources', text: (s) => `${s.name} ${s.interface} ${s.owner}` }} csv={{ name: 'sources' }}
      columns={[
        { key: 'name', label: 'Source', sort: true, render: (s) => <span className="dxk-main">{s.name}</span> },
        { key: 'interface', label: 'Interface', sort: true },
        { key: 'freshness_hours', label: 'Fresh within', sort: true, render: (s) => fresh(s.freshness_hours) },
        { key: 'records', label: 'Records', align: 'num', sort: true, render: (s) => s.records.toLocaleString('en-IN') },
        { key: 'latest_as_of', label: 'Latest as of', sort: true, render: (s) => <span className="dxk-muted">{s.latest_as_of ? String(s.latest_as_of).slice(0, 10) : '—'}</span> },
        { key: 'owner', label: 'Owner', sort: true },
      ]} />
  )
}

const STATE = { CURRENT: ['Current', 'ok'], STALE: ['Stale', 'bad'], UNDATED: ['No dates supplied', 'neutral'], EMPTY: ['No data yet', 'neutral'] }
const stateLabel = (x) => (STATE[x] || [x])[0]

function SourceCard({ s, active, onPick, onDetails }) {
  const [label, tone] = STATE[s.state] || [s.state, 'neutral']
  return (
    <div className={`dxk-src tone-${tone}${active ? ' active' : ''}`}>
      <button type="button" className="dxk-src-main" aria-pressed={active} onClick={onPick}
        aria-label={`${s.name}: ${s.elements.length} data elements. ${active ? 'Showing them. Select to show all' : 'Select to show them'}`}>
        <span className="dxk-src-name">{s.name}</span>
        <span className="dxk-src-state"><i aria-hidden="true" />{label}</span>
        <span className="dxk-src-meta">{tr('{records} records · latest {v}', { records: s.records.toLocaleString('en-IN'), v: s.latest_as_of ? String(s.latest_as_of).slice(0, 10) : 'not dated' })}</span>
        <span className="dxk-src-count">{s.elements.length ? tr('{n} data element(s)', { n: s.elements.length }) : tr('Supplies data, owns no element')}</span>
      </button>
      <button type="button" className="dxk-src-more" onClick={onDetails} aria-label={`Details of ${s.name}`}>{tr('Details')}</button>
    </div>
  )
}

export default function DxCatalogue() {
  const { data, error, loading } = useMdm('/x/catalogue', undefined, [])
  const [sens, setSens] = useState('')
  const [src, setSrc] = useState('')
  const [qry, setQry] = useState('')
  const [detail, setDetail] = useState(null)
  if (!data) return <div className="mdm-hub"><PageHeader icon="📚" title={tr('Metadata catalogue')} /><Status loading={loading} error={error} /></div>
  const bySource = Object.fromEntries(data.sources.map((s) => [s.source, s]))
  const rows = data.elements.filter((e) => (!sens || e.sensitivity === sens) && (!src || e.source === src) && (!qry || (qry === 'yes') === !!e.queryable))
  const picked = src ? bySource[src] : null
  const stale = data.sources.filter((s) => s.state === 'STALE').length
  const d = detail ? bySource[detail] : null
  return (
    <div className="mdm-hub">
      <PageHeader icon="📚" title={tr('Metadata catalogue')}
        subtitle={tr('What can be shared, how sensitive it is, and which department is the source of truth for it. A wrong value is always corrected at that department. Select a source to see the data elements it supplies.')} />
      <Stats items={[
        { label: 'Data elements', value: data.elements.length },
        { label: 'High sensitivity', value: data.elements.filter((e) => e.sensitivity === 'HIGH').length, tone: 'bad', active: sens === 'HIGH', onClick: () => setSens(sens === 'HIGH' ? '' : 'HIGH') },
        { label: 'Question only', value: data.elements.filter((e) => !e.queryable).length, hint: 'not available in population queries', tone: 'warn', active: qry === 'no', onClick: () => setQry(qry === 'no' ? '' : 'no') },
        { label: 'Sources', value: data.sources.length, hint: stale ? tr('{n} not current', { n: stale }) : tr('all current'), tone: stale ? 'warn' : 'ok' },
      ]} />
      <Card title={tr('Sources')} hint={tr('Where the data comes from. A data element is only as fresh as its source.')} >
        <div className="dxk-srcgrid">
          {data.sources.map((s) => <SourceCard key={s.source} s={s} active={src === s.source} onPick={() => setSrc(src === s.source ? '' : s.source)} onDetails={() => setDetail(s.source)} />)}
        </div>
      </Card>
      <Card title={picked ? tr('Data elements from {name}', { name: picked.name }) : tr('Data elements')} hint={picked ? tr('Showing only what this source supplies. Select the source again to see all.') : undefined} flush>
        <DataTable rows={rows} rowKey="element" pageSize={15} initialSort={{ key: 'name', dir: 'asc' }} csv={{ name: 'catalogue' }}
          search={{ placeholder: 'Search elements', text: (e) => `${e.name} ${e.element} ${e.authoritative}` }}
          canClear={!!(sens || src || qry)} onClear={() => { setSens(''); setSrc(''); setQry('') }}
          filters={<>
            <FilterSelect label={tr('Sensitivity')} value={sens} onChange={setSens} options={[['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']]} />
            <FilterSelect label={tr('Source of truth')} value={src} onChange={setSrc} options={data.sources.filter((s) => s.elements.length).map((s) => [s.source, s.name])} />
            <FilterSelect label={tr('Population query')} value={qry} onChange={setQry} options={[['yes', 'Yes'], ['no', 'Question only']]} />
          </>}
          empty={tr('No data elements match')}
          columns={[
            { key: 'name', label: 'Element', sort: true, render: (e) => <><span className="dxk-main">{e.name}</span><div className="mdm-sub">{e.element}</div></> },
            { key: 'authoritative', label: 'Source of truth', sort: true, render: (e) => { const s = bySource[e.source]; const [lab, tone] = STATE[s?.state] || ['', 'neutral']; return (
              <button type="button" className="mdm-link" onClick={() => setDetail(e.source)} title={`${e.authoritative}: ${lab}`}><i className={`dxk-dot tone-${tone}`} aria-hidden="true" /> {e.authoritative}<span className="dxk-sr"> ({lab})</span></button>) } },
            { key: 'sensitivity', label: 'Sensitivity', sort: true, render: (e) => <Badge tone={SENS[e.sensitivity] || 'neutral'}>{e.sensitivity.toLowerCase()}</Badge> },
            { key: 'queryable', label: 'Population query', sort: (e) => (e.queryable ? 1 : 0), render: (e) => (e.queryable ? 'Yes' : 'Question only') },
            { key: 'purposes', label: 'Uses that allow it', align: 'num', sort: (e) => e.purposes.length, render: (e) => e.purposes.length },
          ]} />
      </Card>
      <Drawer open={!!d} title={d?.name || ''} subtitle={d ? `${stateLabel(d.state)} · owned by ${d.owner}` : ''} onClose={() => setDetail(null)}>
        {d && <>
          <Facts items={[['Interface', d.interface], ['Fresh within', fresh(d.freshness_hours)], ['Records', d.records.toLocaleString('en-IN')],
            ['Latest as of', d.latest_as_of ? String(d.latest_as_of).slice(0, 10) : 'not dated'], ['Owner', d.owner]]} />
          <h3 className="dxk-drawer-h">{tr('Data elements it supplies')}</h3>
          {d.elements.length ? <ul className="dxk-list">{d.elements.map((k) => { const e = data.elements.find((x) => x.element === k); return <li key={k}>{e?.name || k} <span className="mdm-sub">{k}</span></li> })}</ul>
            : <p className="mdm-sub">{tr('It supplies data to the master record but is not the source of truth for any element in this catalogue.')}</p>}
          {d.elements.length > 0 && <button type="button" className="btn-secondary small" onClick={() => { setSrc(d.source); setDetail(null) }}>{tr('Show these in the table')}</button>}
        </>}
      </Drawer>
    </div>
  )
}

export function DxRegistry() {
  const { data, error, loading } = useMdm('/x/registry', undefined, [])
  const [dept, setDept] = useState('')
  const [consent, setConsent] = useState('')
  if (!data) return <div className="mdm-hub"><PageHeader icon="🗂" title={tr('Information registry')} /><Status loading={loading} error={error} /></div>
  const depts = [...new Set(data.purposes.map((p) => p.requester))].sort()
  const rows = data.purposes.filter((p) => (!dept || p.requester === dept) && (!consent || (consent === 'yes') === !!p.consent_required))
  return (
    <div className="mdm-hub">
      <PageHeader icon="🗂" title={tr('Information registry')} subtitle={tr('Who may ask for what, for which use, and whether the person must agree first.')} />
      <Card title={tr('Uses')} flush>
        <DataTable rows={rows} rowKey="purpose" pageSize={15} initialSort={{ key: 'name', dir: 'asc' }} csv={{ name: 'registry' }}
          search={{ placeholder: 'Search uses, departments or elements', text: (p) => `${p.name} ${p.requester} ${p.use_case} ${p.elements.join(' ')}` }}
          canClear={!!(dept || consent)} onClear={() => { setDept(''); setConsent('') }}
          filters={<>
            <FilterSelect label={tr('Who may ask')} value={dept} onChange={setDept} options={depts} />
            <FilterSelect label={tr('Consent')} value={consent} onChange={setConsent} options={[['yes', 'Required'], ['no', 'Not needed (statutory)']]} />
          </>}
          columns={[
            { key: 'name', label: 'Use', sort: true, render: (p) => <><span className="dxk-main">{p.name}</span><div className="mdm-sub">{p.use_case}</div></> },
            { key: 'requester', label: 'Who may ask', sort: true },
            { key: 'consent_required', label: 'Consent', sort: (p) => (p.consent_required ? 1 : 0), render: (p) => (p.consent_required ? <Badge tone="info">{tr('Required')}</Badge> : <Badge>{tr('Not needed (statutory)')}</Badge>) },
            { key: 'elements', label: 'What it covers', render: (p) => <span className="dxk-muted">{p.elements.map((e) => e.replace(/_/g, ' ')).join(', ')}</span> },
            { key: 'consents', label: 'Consents so far', render: (p) => <span className="dxk-muted">{Object.entries(p.consents).map(([k, n]) => `${(CONSENT[k]?.[0] || k).toLowerCase()} ${n}`).join(' · ') || '—'}</span> },
          ]} />
      </Card>
    </div>
  )
}

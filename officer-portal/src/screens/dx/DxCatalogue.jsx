import { useState } from 'react'
import { useMdm, Status, Badge } from '../mdm/shared'
import { CONSENT } from './dxShared'
import { PageHeader, Card, DataTable, FilterSelect, Segmented, Stats } from './dxKit'

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

export default function DxCatalogue() {
  const { data, error, loading } = useMdm('/x/catalogue', undefined, [])
  const [sens, setSens] = useState('')
  const [owner, setOwner] = useState('')
  const [qry, setQry] = useState('')
  if (!data) return <div className="mdm-hub"><PageHeader icon="📚" title="Metadata catalogue" /><Status loading={loading} error={error} /></div>
  const owners = [...new Set(data.elements.map((e) => e.authoritative))].sort()
  const rows = data.elements.filter((e) => (!sens || e.sensitivity === sens) && (!owner || e.authoritative === owner) && (!qry || (qry === 'yes') === !!e.queryable))
  return (
    <div className="mdm-hub">
      <PageHeader icon="📚" title="Metadata catalogue"
        subtitle="What can be shared, how sensitive it is, and which department is the source of truth for it. A wrong value is always corrected at that department." />
      <Stats items={[
        { label: 'Data elements', value: data.elements.length },
        { label: 'High sensitivity', value: data.elements.filter((e) => e.sensitivity === 'HIGH').length, tone: 'bad', active: sens === 'HIGH', onClick: () => setSens(sens === 'HIGH' ? '' : 'HIGH') },
        { label: 'Question only', value: data.elements.filter((e) => !e.queryable).length, hint: 'not available in population queries', tone: 'warn', active: qry === 'no', onClick: () => setQry(qry === 'no' ? '' : 'no') },
        { label: 'Sources', value: data.sources.length },
      ]} />
      <Card title="Data elements" flush>
        <DataTable rows={rows} rowKey="element" pageSize={15} initialSort={{ key: 'name', dir: 'asc' }} csv={{ name: 'catalogue' }}
          search={{ placeholder: 'Search elements', text: (e) => `${e.name} ${e.element} ${e.authoritative}` }}
          canClear={!!(sens || owner || qry)} onClear={() => { setSens(''); setOwner(''); setQry('') }}
          filters={<>
            <FilterSelect label="Sensitivity" value={sens} onChange={setSens} options={[['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']]} />
            <FilterSelect label="Source of truth" value={owner} onChange={setOwner} options={owners} />
            <FilterSelect label="Population query" value={qry} onChange={setQry} options={[['yes', 'Yes'], ['no', 'Question only']]} />
          </>}
          columns={[
            { key: 'name', label: 'Element', sort: true, render: (e) => <><span className="dxk-main">{e.name}</span><div className="mdm-sub">{e.element}</div></> },
            { key: 'authoritative', label: 'Source of truth', sort: true },
            { key: 'sensitivity', label: 'Sensitivity', sort: true, render: (e) => <Badge tone={SENS[e.sensitivity] || 'neutral'}>{e.sensitivity.toLowerCase()}</Badge> },
            { key: 'queryable', label: 'Population query', sort: (e) => (e.queryable ? 1 : 0), render: (e) => (e.queryable ? 'Yes' : 'Question only') },
            { key: 'purposes', label: 'Uses that allow it', align: 'num', sort: (e) => e.purposes.length, render: (e) => e.purposes.length },
          ]} />
      </Card>
      <Card title="Sources" flush><SourceTable sources={data.sources} /></Card>
    </div>
  )
}

export function DxRegistry() {
  const { data, error, loading } = useMdm('/x/registry', undefined, [])
  const [dept, setDept] = useState('')
  const [consent, setConsent] = useState('')
  if (!data) return <div className="mdm-hub"><PageHeader icon="🗂" title="Information registry" /><Status loading={loading} error={error} /></div>
  const depts = [...new Set(data.purposes.map((p) => p.requester))].sort()
  const rows = data.purposes.filter((p) => (!dept || p.requester === dept) && (!consent || (consent === 'yes') === !!p.consent_required))
  return (
    <div className="mdm-hub">
      <PageHeader icon="🗂" title="Information registry" subtitle="Who may ask for what, for which use, and whether the person must agree first." />
      <Card title="Uses" flush>
        <DataTable rows={rows} rowKey="purpose" pageSize={15} initialSort={{ key: 'name', dir: 'asc' }} csv={{ name: 'registry' }}
          search={{ placeholder: 'Search uses, departments or elements', text: (p) => `${p.name} ${p.requester} ${p.use_case} ${p.elements.join(' ')}` }}
          canClear={!!(dept || consent)} onClear={() => { setDept(''); setConsent('') }}
          filters={<>
            <FilterSelect label="Who may ask" value={dept} onChange={setDept} options={depts} />
            <FilterSelect label="Consent" value={consent} onChange={setConsent} options={[['yes', 'Required'], ['no', 'Not needed (statutory)']]} />
          </>}
          columns={[
            { key: 'name', label: 'Use', sort: true, render: (p) => <><span className="dxk-main">{p.name}</span><div className="mdm-sub">{p.use_case}</div></> },
            { key: 'requester', label: 'Who may ask', sort: true },
            { key: 'consent_required', label: 'Consent', sort: (p) => (p.consent_required ? 1 : 0), render: (p) => (p.consent_required ? <Badge tone="info">Required</Badge> : <Badge>Not needed (statutory)</Badge>) },
            { key: 'elements', label: 'What it covers', render: (p) => <span className="dxk-muted">{p.elements.map((e) => e.replace(/_/g, ' ')).join(', ')}</span> },
            { key: 'consents', label: 'Consents so far', render: (p) => <span className="dxk-muted">{Object.entries(p.consents).map(([k, n]) => `${(CONSENT[k]?.[0] || k).toLowerCase()} ${n}`).join(' · ') || '—'}</span> },
          ]} />
      </Card>
    </div>
  )
}

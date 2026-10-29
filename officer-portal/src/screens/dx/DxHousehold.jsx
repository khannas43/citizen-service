import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMdm, Status, Badge } from '../mdm/shared'
import { PersonPicker } from './dxShared'
import { PageHeader, Card, DataTable, Facts, Banner, EmptyState } from './dxKit'

export default function DxHousehold() {
  const [params, setParams] = useSearchParams()
  const [pid, setPid] = useState(params.get('person') ? Number(params.get('person')) : null)
  const { data, error, loading } = useMdm(pid ? `/x/persons/${pid}/household` : '/x/standards', undefined, [pid])
  const h = pid ? data : null
  return (
    <div className="mdm-hub">
      <PageHeader icon="🏠" title="Household view"
        subtitle="A household is formed from people who share a ration card. That is a practical proxy, not a legal definition, and this screen says where it falls short." />
      <Card title="Start from a person"><PersonPicker onPick={(p) => { setPid(p.id); setParams({ person: p.id }) }} label="Name, ration card or MDM id" /></Card>
      {pid && <Status loading={loading && !h} error={error} />}
      {!pid && <Card><EmptyState icon="🏠" title="No household selected" hint="Search for a person above to see everyone on the same ration card." /></Card>}
      {h && (
        <>
          <Card title={h.person.name} hint={h.person.mdm_id}>
            <Facts items={[['Ration card', h.cards.length ? h.cards.join(', ') : 'none'], ['Members', h.members.length]]} />
          </Card>
          <Card title="Members" flush>
            <DataTable rows={h.members} pageSize={10} pageSizes={[10, 25]} initialSort={{ key: 'age', dir: 'desc' }}
              search={{ placeholder: 'Search members', text: (m) => `${m.name} ${m.mdm_id} ${m.relation || ''}` }} csv={{ name: 'household' }}
              columns={[
                { key: 'name', label: 'Member', sort: true, render: (m) => <><span className="dxk-main">{m.name}</span>{m.is_selected && <> <Badge tone="info">selected</Badge></>}{m.life_status === 'DECEASED' && <> <Badge tone="bad">death registered</Badge></>}<div className="mdm-sub">{m.mdm_id}</div></> },
                { key: 'age', label: 'Age', align: 'num', sort: true, render: (m) => m.age ?? '—' },
                { key: 'relation', label: 'Relation', sort: true, render: (m) => m.relation || '—' },
                { key: 'tenant', label: 'Tenant', sort: (m) => (m.tenant ? 1 : 0), render: (m) => (m.tenant ? <Badge tone="warn">Tenant</Badge> : '—') },
                { key: 'electricity', label: 'Electricity', render: (m) => (m.electricity ? 'Linked' : '—') },
                { key: 'housing', label: 'Housing', render: (m) => (m.housing ? 'Applied' : '—') },
                { key: 'land', label: 'Land', render: (m) => (m.land ? 'Holds' : '—') },
              ]} />
          </Card>
          <Banner tone="warn"><strong>Where this view can mislead.</strong>
            <ul className="mdm-plain" style={{ marginTop: '0.4rem' }}>{h.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul></Banner>
        </>
      )}
    </div>
  )
}

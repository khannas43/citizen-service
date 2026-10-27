import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMdm, Status, Badge } from '../mdm/shared'
import { PersonPicker } from './dxShared'

export default function DxHousehold() {
  const [params, setParams] = useSearchParams()
  const [pid, setPid] = useState(params.get('person') ? Number(params.get('person')) : null)
  const { data, error, loading } = useMdm(pid ? `/x/persons/${pid}/household` : '/x/standards', undefined, [pid])
  const h = pid ? data : null
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Household view</h1>
      <p className="mdm-intro">A household is formed from people who share a ration card. That is a practical proxy, not a legal definition, and this screen says where it falls short.</p>
      <PersonPicker onPick={(p) => { setPid(p.id); setParams({ person: p.id }) }} label="Start from a person" />
      {pid && <Status loading={loading && !h} error={error} />}
      {h && (
        <>
          <p className="mdm-note">{h.person.name} · {h.person.mdm_id} · {h.cards.length ? `ration card ${h.cards.join(', ')}` : 'no ration card'}</p>
          <section className="mdm-card flush"><div className="mdm-table-wrap"><table className="mdm-table">
            <thead><tr><th>Member</th><th>Age</th><th>Relation</th><th>Tenant</th><th>Electricity</th><th>Housing</th><th>Land</th></tr></thead>
            <tbody>{h.members.map((m) => (
              <tr key={m.id}><td><strong>{m.name}</strong>{m.is_selected && <> <Badge tone="info">selected</Badge></>}{m.life_status === 'DECEASED' && <> <Badge tone="bad">death registered</Badge></>}<div className="mdm-sub">{m.mdm_id}</div></td>
                <td>{m.age ?? '—'}</td><td>{m.relation || '—'}</td><td>{m.tenant ? <Badge tone="warn">Tenant</Badge> : '—'}</td>
                <td>{m.electricity ? 'Linked' : '—'}</td><td>{m.housing ? 'Applied' : '—'}</td><td>{m.land ? 'Holds' : '—'}</td></tr>
            ))}</tbody>
          </table></div></section>
          <section className="mdm-card" aria-label="Limits of this view">
            <h3>Where this view can mislead</h3>
            <ul className="mdm-plain">{h.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </section>
        </>
      )}
    </div>
  )
}

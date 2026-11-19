import { useMdm, Status, Badge } from './shared'
import { lifeLabel, dqLabel } from './labels'
import { Drawer, Facts } from '../dx/dxKit'
import { tr } from '../../i18n/lang'
import { Name, Pl } from '../../i18n/mt'

const ATTR_LABEL = { name: 'Name', dob: 'Date of birth', birth_year: 'Year of birth', gender: 'Gender', address: 'Address', date_of_death: 'Date of death' }
export const personUrl = (id) => `/mdm?tab=people&person=${id}`

/** An MDM id that opens the person in a side panel; Ctrl/Cmd-click or middle-click opens the full record in a new tab as any link would. */
export function MdmIdLink({ id, mdmId, onPeek }) {
  return (
    <a className="mdm-link mdm-idlink" href={personUrl(id)} title={tr('See this person\'s record')}
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onPeek(id) }}>{mdmId}</a>
  )
}

function Body({ id }) {
  const { data: d, error, loading } = useMdm(`/persons/${id}`, undefined, [id])
  if (!d) return <Status loading={loading} error={error} />
  const p = d.person
  const issues = d.issues.filter((i) => i.status !== 'RESOLVED')
  const people = d.relationships.map((r) => [r.kind === 'SPOUSE' ? 'Spouse' : r.role_of_other === 'PARENT' ? 'Parent' : 'Child', r.other.name]).filter(Boolean)
  return (
    <div className="peek">
      <Facts items={[
        ['MDM id', <code key="i">{p.mdm_id}</code>],
        ['Born', p.dob || p.birth_year],
        ['Gender', p.gender],
        ['Place', <Pl key="pl" parts={[p.village, p.mandal, p.district]} />],
        ['Life status', p.life_status === 'DECEASED' ? <Badge tone="bad">{lifeLabel(p.life_status)}</Badge> : lifeLabel(p.life_status)],
        ['Systems', `${p.source_count} of ${p.source_count + d.missing_sources.length}`],
      ]} />
      {people.length > 0 && <>
        <h4>{tr('Family known to the registry')}</h4>
        <ul className="mdm-plain">{people.map(([k, n], i) => <li key={i}><span className="mdm-sub">{k}</span> <Name text={n} /></li>)}</ul>
      </>}
      <h4>{tr('Chosen values')}</h4>
      <table className="mdm-table tight">
        <thead><tr><th scope="col">{tr('Field')}</th><th scope="col">{tr('Value')}</th><th scope="col">{tr('From')}</th></tr></thead>
        <tbody>
          {d.attributes.map((a) => (
            <tr key={a.attribute}><td>{ATTR_LABEL[a.attribute] || a.attribute}</td>
              <td><strong>{a.value || '—'}</strong>{a.conflict && <> <Badge tone="warn">{tr('Departments differ')}</Badge></>}</td>
              <td className="mdm-sub">{a.chosen_source?.replace(/_/g, ' ')}</td></tr>
          ))}
        </tbody>
      </table>
      <h4>{tr('Department records ({length})', { length: d.records.length })}</h4>
      <ul className="peek-records">
        {d.records.map((r) => (
          <li key={r.id}>
            <strong>{r.source_name}</strong> <span className="mdm-sub">{r.source_rid}</span>
            <div><Name text={r.name} /> · {r.dob || (r.birth_year ? `born ${r.birth_year}` : r.age != null ? `age ${r.age}` : 'born not supplied')}</div>
            {r.address && <div className="mdm-sub">{r.address}</div>}
          </li>
        ))}
      </ul>
      {issues.length > 0 && <>
        <h4>{tr('Open data issues ({length})', { length: issues.length })}</h4>
        <ul className="mdm-plain">{issues.map((i) => <li key={i.id}><Badge tone="warn">{dqLabel(i.code)}</Badge></li>)}</ul>
      </>}
    </div>
  )
}

export default function PersonPeek({ id, onClose }) {
  return (
    <Drawer open={!!id} onClose={onClose} title={tr('Citizen record')} subtitle={tr('A summary to help with the decision. The full record has the household, history and audit.')}>
      {id && <>
        <a className="btn-primary small peek-open" href={personUrl(id)} target="_blank" rel="noopener noreferrer">{tr('Open full record in a new tab ↗')}</a>
        <Body id={id} />
      </>}
    </Drawer>
  )
}

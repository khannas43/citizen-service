import { tr } from '../../i18n/lang'

export const EVENT_STATUS = {
  PROCESSED: ['Processed', 'ok'], HELD: ['Held', 'warn'], DUPLICATE: ['Duplicate ignored', 'neutral'], WITHDRAWN: ['Withdrawn', 'neutral'],
  NO_MATCH: ['No matching person', 'warn'], AMENDMENT: ['Amendment applied', 'info'],
}

export function describeEvent(e) {
  const p = e.payload || {}
  switch (e.event_type) {
    case 'BIRTH_REGISTERED': return tr('Birth registered: {name}, born {born}', { name: p.child_name || tr('(name not given yet)'), born: p.date_of_birth })
    case 'BIRTH_AMENDED': return tr('Birth amended: name is now {name}', { name: p.child_name })
    case 'BIRTH_WITHDRAWN': return tr('Birth registration withdrawn ({reason})', { reason: p.reason || tr('no reason given') })
    case 'DEATH_REGISTERED': return tr('Death registered: {name}, age {age}, died {date} in {place}', { name: p.name, age: p.age_at_death, date: p.date_of_death, place: p.place_of_death })
    case 'MARRIAGE_REGISTERED': return tr('Marriage registered: {groom} and {bride}, {date}', { groom: p.groom_name, bride: p.bride_name, date: p.marriage_date })
    default: return e.event_type
  }
}

export function OptionRow({ o, name, checked, onPick }) {
  return (
    <label className={`mdm-opt${checked ? ' picked' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onPick} />
      <span>
        <strong>{o.name}</strong> <span className="mdm-sub">{tr('{mdm_id} · match {Math}%', { mdm_id: o.mdm_id, Math: Math.round(o.score * 100) })}</span>
        <span className="mdm-sub block">
          {tr('born {v}{v2} · in {systems} system(s) {v3} {v4}', { v: o.born || 'unknown', v2: o.place ? ` · ${o.place}` : '', systems: o.systems, v3: o.ration_cards?.length ? ` · ration card ${o.ration_cards.join(', ')}` : ' · not on a ration card', v4: o.spouse?.length ? ` · spouse ${o.spouse.join(', ')}` : '' })}
        </span>
      </span>
    </label>
  )
}

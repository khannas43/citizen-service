import { Link, useNavigate } from 'react-router-dom'
import { Name } from '../../i18n/mt'
import { tr } from '../../i18n/lang'

/** One person named on an event (a parent, a bride or groom): a link to their page when matched, with where the match stands. */
export function PartyName({ p, big }) {
  const nav = useNavigate()
  const note = p.state === 'AWAITING' ? tr("matched, awaiting an officer's approval") : p.state === 'DECLINED' ? tr('matched, not approved') : !p.person_id ? tr('not matched') : null
  return (
    <span>
      {p.person_id
        ? <button type="button" className={`dxk-namebtn${big ? ' lin-chosen-name' : ''}`} title={`Open ${p.name}`} onClick={(x) => { x.stopPropagation(); nav(`/mdm?tab=people&person=${p.person_id}`) }}>{<Name text={p.name} />}</button>
        : <strong className={big ? 'lin-chosen-name' : undefined} title={p.why || 'Not matched to a person in master data'}><Name text={p.name} /></strong>}
      {note && <span className="dxk-muted" title={p.why || undefined}> · {note}</span>}
    </span>
  )
}

/** "Mother: A · Father: B", each name a link. */
export function Parents({ parents }) {
  if (!parents?.length) return null
  return (
    <div className="lin-chosen-facts" aria-label={tr('Parents')}>
      {parents.map((p) => <span key={p.role}>{p.role}: <PartyName p={p} /></span>)}
    </div>
  )
}

/** Where an event came from: a scripted scenario, or an event injected from the demo screen. */
export function MadeBy({ id, title, back }) {
  if (!id) return null
  const injected = String(id).startsWith('INJECT-')
  return injected
    ? <Link to="/dx/inject" onClick={(x) => x.stopPropagation()} title={title || ''}>{back ? tr('Back to injected events') : tr('Created by an injected event')}</Link>
    : <Link to={`/dx/scenarios?open=${id}`} onClick={(x) => x.stopPropagation()} title={title || ''}>{back ? tr('Back to scenario {id}', { id }) : tr('Created by scenario {id}', { id })}</Link>
}

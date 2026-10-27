import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager } from './shared'
import { fmtDate } from './labels'

export const EVENT_STATUS = {
  PROCESSED: ['Processed', 'ok'], HELD: ['Held', 'warn'], DUPLICATE: ['Duplicate ignored', 'neutral'], WITHDRAWN: ['Withdrawn', 'neutral'],
  NO_MATCH: ['No matching person', 'warn'], AMENDMENT: ['Amendment applied', 'info'],
}
const PROPOSAL_STATUS = { PROPOSED: ['Waiting for a steward', 'warn'], APPROVED: ['Approved', 'ok'], REJECTED: ['Rejected', 'neutral'], WITHDRAWN: ['Cancelled', 'neutral'] }

export function describeEvent(e) {
  const p = e.payload || {}
  switch (e.event_type) {
    case 'BIRTH_REGISTERED': return `Birth registered: ${p.child_name || '(name not given yet)'}, born ${p.date_of_birth}`
    case 'BIRTH_AMENDED': return `Birth amended: name is now ${p.child_name}`
    case 'BIRTH_WITHDRAWN': return `Birth registration withdrawn (${p.reason || 'no reason given'})`
    case 'DEATH_REGISTERED': return `Death registered: ${p.name}, age ${p.age_at_death}, died ${p.date_of_death} in ${p.place_of_death}`
    case 'MARRIAGE_REGISTERED': return `Marriage registered: ${p.groom_name} and ${p.bride_name}, ${p.marriage_date}`
    default: return e.event_type
  }
}

export function OptionRow({ o, name, checked, onPick }) {
  return (
    <label className={`mdm-opt${checked ? ' picked' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onPick} />
      <span>
        <strong>{o.name}</strong> <span className="mdm-sub">{o.mdm_id} · match {Math.round(o.score * 100)}%</span>
        <span className="mdm-sub block">
          born {o.born || 'unknown'}{o.place ? ` · ${o.place}` : ''} · in {o.systems} system(s)
          {o.ration_cards?.length ? ` · ration card ${o.ration_cards.join(', ')}` : ' · not on a ration card'}
          {o.spouse?.length ? ` · spouse ${o.spouse.join(', ')}` : ''}
        </span>
      </span>
    </label>
  )
}

function Proposal({ p, reload, openPerson, canAct = true }) {
  const [pick, setPick] = useState({ person_id: p.detail?.suggested || null, groom_id: p.detail?.suggested?.groom || null, bride_id: p.detail?.suggested?.bride || null })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [st, tone] = PROPOSAL_STATUS[p.status] || [p.status, 'neutral']
  const open = p.status === 'PROPOSED'
  const send = async (decision) => {
    setBusy(true); setErr(null)
    try {
      await mdm(`/proposals/${p.id}/decision`, { method: 'POST', body: { decision, note: note.trim() || null, ...pick } })
      reload()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const death = p.kind === 'CONFIRM_DEATH'
  const marriage = p.kind === 'CONFIRM_MARRIAGE'
  const ready = death ? !!pick.person_id : marriage ? !!(pick.groom_id && pick.bride_id) : true
  return (
    <div className={`mdm-prop${p.parent_id ? ' child' : ''}`}>
      <div className="mdm-prop-head">
        <div><strong>{p.summary}</strong><div className="mdm-sub">{p.system}</div></div>
        <Badge tone={tone}>{st}</Badge>
      </div>
      {p.detail?.outside_state && <p className="mdm-note">Registered outside the state ({p.detail.place_of_death}). Check the details with that registrar before confirming.</p>}
      {p.detail?.urgent && <p className="mdm-note"><Badge tone="bad">Urgent</Badge> A payment is due on {p.detail.next_payment_on}.</p>}
      {open && death && (
        <fieldset className="mdm-opts">
          <legend>{p.detail?.ambiguous ? 'More than one person could match. Choose carefully, or reject if none is right.' : 'Who is this?'}</legend>
          {p.options.map((o) => <OptionRow key={o.person_id} o={o} name={`d${p.id}`} checked={pick.person_id === o.person_id} onPick={() => setPick({ ...pick, person_id: o.person_id })} />)}
        </fieldset>
      )}
      {open && marriage && ['groom', 'bride'].map((side) => (
        <fieldset className="mdm-opts" key={side}>
          <legend>{side === 'groom' ? 'The groom' : 'The bride'}</legend>
          {p.options[side].map((o) => <OptionRow key={o.person_id} o={o} name={`${side}${p.id}`} checked={pick[`${side}_id`] === o.person_id} onPick={() => setPick({ ...pick, [`${side}_id`]: o.person_id })} />)}
        </fieldset>
      ))}
      {open && p.kind === 'REVIEW_PARENTS' && p.detail?.candidates && (
        <details className="mdm-evidence"><summary>People who partly match the parent names</summary>
          {['father', 'mother'].map((k) => (p.detail.candidates[k] || []).map((o) => <div key={k + o.person_id} className="mdm-sub">{k}: {o.name} · born {o.born || 'unknown'} · {o.place || 'place unknown'} · match {Math.round(o.score * 100)}%</div>))}
        </details>
      )}
      {!open && p.decided_by && <p className="mdm-sub">{st} by {p.decided_by}{p.decided_at ? ` on ${fmtDate(p.decided_at)}` : ''}{p.note ? ` — ${p.note}` : ''}</p>}
      {p.person_id && <button type="button" className="mdm-link" onClick={() => openPerson(p.person_id)}>Open the person</button>}
      {open && canAct && (
        <div className="mdm-actions">
          <input className="mdm-note-input" placeholder="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label="Note for the audit log" />
          <button type="button" className="btn-primary small" disabled={busy || !ready} onClick={() => send('APPROVE')}>
            {death ? 'Confirm this death' : marriage ? 'Confirm this marriage' : p.kind === 'REVIEW_PARENTS' ? 'Parents checked' : 'Approve'}
          </button>
          <button type="button" className="btn-secondary small" disabled={busy} onClick={() => send('REJECT')}>{death || marriage ? 'None of these' : 'Reject'}</button>
        </div>
      )}
      {err && <p className="mdm-error" role="alert">{err}</p>}
    </div>
  )
}

function EventDetail({ id, back, openPerson }) {
  const { data: e, error, loading, reload } = useMdm(`/events/${id}`, undefined, [id])
  if (!e) return <Status loading={loading} error={error} />
  const [st, tone] = EVENT_STATUS[e.status] || [e.status, 'neutral']
  const main = e.proposals.filter((p) => !p.parent_id)
  const follow = e.proposals.filter((p) => p.parent_id)
  return (
    <div className="mdm-stack">
      <button type="button" className="mdm-link" onClick={back}>← Back to the list</button>
      <section className="mdm-card">
        <h3>{describeEvent(e)}</h3>
        <p><Badge tone={tone}>{st}</Badge> <span className="mdm-sub">registration {e.event_key} · event {e.id}</span></p>
        {e.note && <p className="mdm-note">{e.note}</p>}
        {e.person && <p>About: <button type="button" className="mdm-link strong" onClick={() => openPerson(e.person.id)}>{e.person.name}</button> <span className="mdm-sub">{e.person.mdm_id}</span></p>}
      </section>
      {main.length > 0 && <section className="mdm-card"><h3>What the system proposes</h3>{main.map((p) => <Proposal key={p.id} p={p} reload={reload} openPerson={openPerson} />)}</section>}
      {follow.length > 0 && <section className="mdm-card"><h3>Follow-up actions after confirmation</h3>
        <p className="mdm-note">Approving an action records it and marks it ready for the department. This build does not send anything to the department's system.</p>
        {follow.map((p) => <Proposal key={p.id} p={p} reload={reload} openPerson={openPerson} />)}</section>}
      {!e.proposals.length && <p className="mdm-note">Nothing is proposed for this event.</p>}
    </div>
  )
}

function Feed({ uc, openPerson }) {
  const [sel, setSel] = useState(null)
  const [tick, setTick] = useState(0)
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const limit = 30
  const { data, error, loading } = useMdm('/events', { uc, limit, offset }, [uc, offset, tick])
  if (sel) return <EventDetail id={sel} back={() => { setSel(null); setTick((n) => n + 1) }} openPerson={openPerson} />
  const replay = async () => {
    setBusy(true); setMsg(null)
    try { const r = await mdm('/events/replay', { method: 'POST' }); setMsg(`Processed ${r.events} sample events.`); setTick((n) => n + 1) } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  return (
    <div className="mdm-stack">
      <Status loading={loading && !data} error={error} />
      {data && data.total === 0 && (
        <section className="mdm-card">
          <p className="mdm-note">No events have arrived yet. In production the departments publish these as they happen. For a walkthrough, play the sample feed (34 events covering all three event types).</p>
          <button type="button" className="btn-primary" disabled={busy} onClick={replay}>Play the sample feed</button>
          {msg && <p className="mdm-note" role="status">{msg}</p>}
        </section>
      )}
      {data && data.total > 0 && (
        <section className="mdm-card flush">
          <div className="mdm-table-wrap">
            <table className="mdm-table">
              <thead><tr><th className="num">#</th><th>Event</th><th>Outcome</th><th className="num">Waiting for you</th><th /></tr></thead>
              <tbody>
                {data.items.map((e) => {
                  const [st, tone] = EVENT_STATUS[e.status] || [e.status, 'neutral']
                  return (
                    <tr key={e.id}>
                      <td className="num">{e.seq}</td>
                      <td>{describeEvent(e)}{e.case_kind && e.case_kind !== 'PLAIN' && <div className="mdm-sub">case: {e.case_kind.replace(/_/g, ' ').toLowerCase()}</div>}</td>
                      <td><Badge tone={tone}>{st}</Badge><div className="mdm-sub">{e.note}</div></td>
                      <td className="num">{e.open_proposals || 0}</td>
                      <td><button type="button" className="btn-primary small" onClick={() => setSel(e.id)}>Open</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
        </section>
      )}
    </div>
  )
}

function Turning18({ openPerson }) {
  const [offset, setOffset] = useState(0)
  const limit = 25
  const { data, error, loading } = useMdm('/worklists/turning-18', { limit, offset }, [offset])
  if (!data) return <Status loading={loading} error={error} />
  const tone = { valid: 'ok', expired: 'warn', none: 'bad' }
  const label = { valid: 'Valid', expired: 'Expired', none: 'None on file' }
  return (
    <section className="mdm-card flush">
      <div className="mdm-card-pad">
        <p className="mdm-note">People born in the three years up to {fmtDate(data.as_of)} minus 17 years: about to turn 18 or just turned. For each, what they would need to claim a scholarship or other adult entitlements.</p>
      </div>
      <div className="mdm-table-wrap">
        <table className="mdm-table">
          <thead><tr><th>Person</th><th>Born</th><th>Turns 18</th><th>Identity reference</th><th>Income certificate</th><th>Caste certificate</th><th>Scholarship portal</th><th>Next step</th></tr></thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td><button type="button" className="mdm-link strong" onClick={() => openPerson(r.id)}>{r.name}</button><div className="mdm-sub">{r.district}</div></td>
                <td>{r.dob}</td>
                <td>{fmtDate(r.turns_18)}{r.already_adult && <div className="mdm-sub">already 18</div>}</td>
                <td>{r.has_identity ? <Badge tone="ok">Yes</Badge> : <Badge tone="bad">No</Badge>}</td>
                <td><Badge tone={tone[r.income_state]}>{label[r.income_state]}</Badge></td>
                <td>{r.has_caste ? <Badge tone="ok">On file</Badge> : <span className="mdm-sub">None on file</span>}</td>
                <td>{r.on_scholarship_portal ? <span>{r.course || 'Yes'}</span> : <span className="mdm-sub">Not there</span>}</td>
                <td>{r.next_steps.map((s) => <div key={s}>{s}</div>)}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan="8" className="mdm-empty">Nobody in this age band.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
    </section>
  )
}

function Households({ openPerson }) {
  const { data, error, loading } = useMdm('/worklists/household')
  if (!data) return <Status loading={loading} error={error} />
  return (
    <div className="mdm-stack">
      <section className="mdm-card">
        <h3>Housing applications inside one household ({data.duplicate_benefit.length})</h3>
        <p className="mdm-note">Two applications from people on the same ration card, married to each other, or the same person. Check whether the household is entitled to more than one.</p>
        {data.duplicate_benefit.length ? (
          <ul className="mdm-plain">
            {data.duplicate_benefit.map((d) => (
              <li key={d.first + d.second}>
                <button type="button" className="mdm-link" onClick={() => openPerson(d.first_person)}>{d.first_name}</button> <span className="mdm-sub">{d.first} · {d.first_status}</span>
                {' and '}
                <button type="button" className="mdm-link" onClick={() => openPerson(d.second_person)}>{d.second_name}</button> <span className="mdm-sub">{d.second} · {d.second_status}</span>
                {d.same_person && <> <Badge tone="bad">same person</Badge></>}
              </li>
            ))}
          </ul>
        ) : <p className="mdm-note">None found.</p>}
      </section>
      <section className="mdm-card">
        <h3>Deceased but still active on a ration card ({data.dead_active.total})</h3>
        <ul className="mdm-plain">
          {data.dead_active.items.slice(0, 15).map((i) => <li key={i.id}><button type="button" className="mdm-link" onClick={() => openPerson(i.person_id)}>{i.name}</button> <span className="mdm-sub">{i.detail}</span></li>)}
        </ul>
        {data.dead_active.total > 15 && <p className="mdm-sub">Showing 15. The Data quality tab lists all of them.</p>}
      </section>
      <section className="mdm-card">
        <h3>On more than one ration card ({data.multi_card.total})</h3>
        {data.multi_card.items.length ? <ul className="mdm-plain">{data.multi_card.items.map((i) => <li key={i.id}><button type="button" className="mdm-link" onClick={() => openPerson(i.person_id)}>{i.name}</button> <span className="mdm-sub">{i.detail}</span></li>)}</ul> : <p className="mdm-note">None found.</p>}
      </section>
    </div>
  )
}

export default function UseCases({ goto, openPerson }) {
  const [uc, setUc] = useState('UC3')
  const { data, error, loading } = useMdm('/usecases')
  if (!data) return <Status loading={loading} error={error} />
  const cur = data.find((u) => u.id === uc)
  return (
    <div className="mdm-stack">
      <p className="mdm-intro">Six situations the exchange has to handle. Each one starts from something a department reports, finds the people and records it touches, and proposes what should follow. Nothing changes until a steward approves it.</p>
      <div className="mdm-uc-cards" role="tablist" aria-label="Use cases">
        {data.map((u) => (
          <button key={u.id} type="button" role="tab" aria-selected={uc === u.id} className={`mdm-uc${uc === u.id ? ' active' : ''}`} onClick={() => setUc(u.id)}>
            <span className="mdm-uc-id">{u.id}</span>
            <strong>{u.title}</strong>
            <span className="mdm-sub">{u.extra || (u.events ? `${u.events} events · ${u.open_proposals} waiting for you` : 'No events yet')}</span>
          </button>
        ))}
      </div>
      <p className="mdm-note"><strong>{cur.title}.</strong> {cur.question}</p>
      {uc === 'UC1' && (
        <section className="mdm-card">
          <p>Identity linkage is what the other tabs show every day: how records from ten systems are tied to one person, with the evidence.</p>
          <div className="mdm-actions">
            <button type="button" className="btn-primary small" onClick={() => goto('people')}>Search people</button>
            <button type="button" className="btn-secondary small" onClick={() => goto('review')}>Doubtful matches ({cur.extra})</button>
          </div>
          <p className="mdm-note">Hard cases to try in People: spellings (Telugu and English forms of one name), a bride whose surname changed after marriage, and a father and son with the same name who must stay separate.</p>
        </section>
      )}
      {['UC2', 'UC3', 'UC6'].includes(uc) && <Feed key={uc} uc={uc} openPerson={openPerson} />}
      {uc === 'UC4' && <Turning18 openPerson={openPerson} />}
      {uc === 'UC5' && <Households openPerson={openPerson} />}
    </div>
  )
}

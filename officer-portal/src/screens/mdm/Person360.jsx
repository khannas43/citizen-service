import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from './shared'
import ExchangePanel from '../dx/ExchangePanel'
import { Hero, Collapse, Stats, Facts, Drawer, Banner } from '../dx/dxKit'
import './person360.css'
import './matchscore.css'
import PersonLineage, { changeText } from '../dx/PersonLineage'
import DeptRecords from './DeptRecords'
import { genderText } from '../../gender'
import { fmtTime } from '../dx/dxShared'
import { dqLabel, fmtDate, lifeLabel, linkLabel, RELATION_TEXT, COMPONENT_LABELS } from './labels'
import { DEFAULT_MATCH, explainScore, KIND_BADGE, EvidenceTable, pc } from './MatchScore'
import { PartyName } from '../dx/PartyKit'
import { tr, tObj, getLang } from '../../i18n/lang'
import { Name, Nm, Pl } from '../../i18n/mt'

const ATTR_LABEL = tObj({ name: 'Name', dob: 'Date of birth', birth_year: 'Year of birth', gender: 'Gender', address: 'Address', date_of_death: 'Date of death' })
const SPOUSE_NOTE = 'The spouse is taken from the marriage register where it has one, otherwise from the household (ration card).'

function Evidence({ ev, match }) {
  if (!ev?.components) return null
  return (
    <details className="mdm-evidence">
      <summary>{tr('Why this match')}</summary>
      <EvidenceTable ev={ev} match={match} />
    </details>
  )
}

/** The match confidence, with the working on hover or keyboard focus: it is the weakest automatic link, not an average. */
function ConfidenceFig({ p, records, match }) {
  const m = match || DEFAULT_MATCH
  const scored = records.filter((r) => r.link_status === 'AUTO_LINKED' && r.score != null).sort((a, b) => Number(a.score) - Number(b.score))
  const unscored = records.filter((r) => !(r.link_status === 'AUTO_LINKED' && r.score != null))
  const weakest = scored[0]
  const x = weakest ? explainScore(weakest.evidence, m) : null
  return (
    <div className="dxk-hero-fig p360-conf" tabIndex={0} aria-describedby="p360-conf-tip">
      <strong>{pc(p.confidence)}</strong><span>{tr('match confidence')} <span aria-hidden="true" className="p360-conf-i">ⓘ</span></span>
      <div className="p360-conf-tip" id="p360-conf-tip" role="tooltip">
        <h4>{tr('Why {v}?', { v: pc(p.confidence) })}</h4>
        {weakest ? (
          <>
            <p>{tr('The confidence is the')} <strong>{tr('weakest automatic link')}</strong> {tr('among this person\'s records, not an average. One doubtful or thinly evidenced record lowers it, so it tells an officer where to look first.')}</p>
            <table>
              <tbody>
                {scored.map((r, i) => {
                  const k = explainScore(r.evidence, m)?.kind
                  return (
                    <tr key={r.id} className={i === 0 ? 'weakest' : ''}>
                      <td>{r.source_name}<small>{r.rtype.replace(/_/g, ' ').toLowerCase()} · {r.source_rid}{k ? ` · ${KIND_BADGE[k][1].toLowerCase()}` : ''}</small></td>
                      <td className="num">{pc(r.score)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {x && <p><strong>{weakest.source_name}</strong>{tr(', the lowest. {sentence}', { sentence: x.sentence })}</p>}
            <p className="p360-conf-note">{tr('Scale: {v} or more links automatically; {v2} up to that goes to a steward; below {v3} the record stands alone. A high score from thin evidence is still a link, so check the records marked thin.', { v: pc(m.auto), v2: pc(m.review), v3: pc(m.review) })}</p>
            {unscored.length > 0 && <p className="p360-conf-note">{tr('Not scored, so not counted:')} {unscored.map((r) => `${r.source_name} (${linkLabel(r.link_status).toLowerCase()})`).join(', ')}.</p>}
          </>
        ) : <p>{tr('Every record of this person is the first record, a single record, or was linked by a steward, so none was matched automatically. Nothing lowers the confidence.')}</p>}
      </div>
    </div>
  )
}

export default function Person360({ id, back, openPerson }) {
  const nav = useNavigate()
  const { data: d, error, loading, reload } = useMdm(`/persons/${id}`, undefined, [id])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sep, setSep] = useState(null)
  const [reason, setReason] = useState('')
  const [sepErr, setSepErr] = useState(null)
  const { data: hh } = useMdm(`/x/persons/${id}/household`, undefined, [id])
  const { data: rulesData } = useMdm('/rules', undefined, [])
  const match = rulesData?.active?.match ? { ...DEFAULT_MATCH, ...rulesData.active.match } : DEFAULT_MATCH
  if (!d && error && /not found/i.test(error)) return (
    <div className="mdm-stack">
      <Banner tone="warn"><strong>{tr('This person no longer exists.')}</strong> {tr('When a steward links a person\'s only record to someone else, the empty person is removed and the record now sits on the person it was linked to. Find them again in the People list by name or record number, or go back to the review queue.')}</Banner>
      <div><button type="button" className="dxk-back-quiet" onClick={back}>{tr('← Back to the list')}</button>{' '}<button type="button" className="dxk-back-quiet" onClick={() => nav('/mdm?tab=review')}>{tr('Open the review queue')}</button></div>
    </div>
  )
  if (!d) return <Status loading={loading} error={error} />
  const p = d.person

  const openSeparate = (r) => { setSep(r); setReason(''); setSepErr(null) }
  const closeSeparate = () => { if (!busy) setSep(null) }
  const confirmSeparate = async () => {
    setBusy(true); setSepErr(null); setMsg(null)
    try {
      const res = await mdm(`/records/${sep.id}/unlink`, { method: 'POST', body: { note: reason.trim() } })
      setSep(null)
      setMsg({ ok: true, text: tr('The {src} record {rid} is now a separate person.', { src: sep.source_name, rid: sep.source_rid }) })
      if (res.new_person_id) setTimeout(() => openPerson(res.new_person_id), 900)
      reload()
    } catch (e) { setSepErr(e.message) }
    setBusy(false)
  }

  const bySource = {}
  d.records.forEach((r) => { (bySource[r.source_name] ||= []).push(r) })

  const openIssues = d.issues.filter((i) => i.status !== 'RESOLVED').length
  const spouses = d.relationships.filter((r) => r.kind === 'SPOUSE')
  const members = hh?.members || []
  const memberIds = new Set(members.map((m) => m.id))
  const bparents = d.birth_parents || []
  const bpIds = new Set(bparents.map((q) => q.person_id).filter(Boolean))
  const others = d.relationships.filter((r) => !memberIds.has(r.other.id) && !(r.role_of_other === 'PARENT' && bpIds.has(r.other.id)))
  const inReview = d.records.filter((r) => r.link_status === 'IN_REVIEW')
  const first = d.issues.length ? 'issues' : 'exchange'
  const high = d.issues.filter((i) => i.severity === 'HIGH').length
  const conflicts = d.attributes.filter((a) => a.conflict).length
  const sexText = genderText(p.gender) || 'Gender not stated'
  return (
    <div className="mdm-stack p360">
      <Hero eyebrow={<>{tr('Person ·')} <code>{p.mdm_id}</code></>}
        title={<Name text={p.name} local={p.name_local} />}
        text={<>{tr(sexText)} · {tr('born {v}', { v: p.dob || p.birth_year || tr('unknown') })} · <Pl parts={[p.village, p.mandal, p.district]} empty={tr('place unknown')} /></>}
        actions={<>
          <button type="button" className="dxk-back" onClick={back}>{tr('← Back to the list')}</button>{' '}
          <button type="button" className="dxk-back" onClick={() => nav(`/mdm?tab=review&q=${encodeURIComponent(p.name || '')}&from=${id}`)}>{tr('Search the review queue by name')}</button>
        </>}
        aside={<>
          <div className="dxk-hero-fig"><strong>{p.source_count}</strong><span>{tr('of 10 systems')}</span></div>
          <ConfidenceFig p={p} records={d.records} match={match} />
          <div className="dxk-hero-fig"><span className={`dxk-pill tone-${p.life_status === 'DECEASED' ? 'bad' : 'ok'}`}>{lifeLabel(p.life_status)}</span><span>{tr('life status')}</span></div>
        </>} />
      {getLang() === 'te' && <p className="mdm-note">{tr('Names and places in Telugu letters are spelled by a machine from the English records and may be slightly off. Hover over one to see the original.')}</p>}
      <Stats items={[
        { label: 'Department records', value: d.records.length, hint: tr('from {v} systems', { v: p.source_count }), tone: 'info' },
        { label: 'Open data issues', value: openIssues, tone: openIssues ? 'warn' : 'ok', hint: openIssues ? tr('see below') : tr('none') },
        { label: 'Fields in conflict', value: d.attributes.filter((a) => a.conflict).length, tone: d.attributes.some((a) => a.conflict) ? 'warn' : undefined, hint: 'where departments differ' },
        { label: 'Household members', value: members.length || '—', hint: hh?.cards?.length ? tr('ration card {v}', { v: hh.cards.join(', ') }) : tr('no ration card') },
      ]} />
      {inReview.length > 0 && (
        <Banner tone="warn">
          <strong>{tr('{v} waiting for a steward.', { v: inReview.length === 1 ? 'One record is' : `${inReview.length} records are` })}</strong>{' '}
          {inReview.map((r) => `${r.source_name} ${r.source_rid}`).join(', ')}{tr(': the system could not tell whether {v} to this person or to someone already known.', { v: inReview.length === 1 ? 'it belongs' : 'they belong' })}{' '}
          {inReview.map((r) => (
            <button key={r.id} type="button" className="btn-primary small" onClick={() => nav(`/mdm?tab=review&q=${encodeURIComponent(r.source_rid)}&open=1&from=${id}`)}>{tr('Review {source_rid}', { source_rid: r.source_rid })}</button>
          ))}
        </Banner>
      )}
      {(d.could_belong || []).length > 0 && (
        <Banner tone="info">
          <strong>{tr('{v} waiting for a steward could belong to this person.', { v: d.could_belong.length === 1 ? 'One more record' : `${d.could_belong.length} more records` })}</strong>{' '}
          {tr('They are held by other people for now:')} {d.could_belong.map((r) => `${r.source_name} ${r.source_rid} (${pc(r.score)})`).join(', ')}.{' '}
          {d.could_belong.map((r) => (
            <button key={r.task_id} type="button" className="btn-secondary small" onClick={() => nav(`/mdm?tab=review&q=${encodeURIComponent(r.source_rid)}&open=1&from=${id}`)}>{tr('Review {source_rid}', { source_rid: r.source_rid })}</button>
          ))}
        </Banner>
      )}
      {msg && <p className={msg.ok ? 'mdm-ok' : 'mdm-error'} role="status">{msg.text}</p>}

      {d.issues.length > 0 && (
        <Collapse id="p360-issues" defaultOpen={first === 'issues'} title={tr('Data issues')} summary={tr('{n} found{high}. Corrections are made at the department that owns the value.', { n: d.issues.length, high: high ? tr(', {v} high', { v: high }) : '' })}>
          <ul className="mdm-plain">
            {d.issues.map((i) => (
              <li key={i.id}>
                <Badge tone={i.severity === 'HIGH' ? 'bad' : i.severity === 'MEDIUM' ? 'warn' : 'neutral'}>{i.severity === 'HIGH' ? 'High' : i.severity === 'MEDIUM' ? 'Medium' : 'Low'}</Badge>{' '}
                <strong>{dqLabel(i.code)}.</strong> {i.detail} {i.status === 'CORRECTION_REQUESTED' && <Badge tone="info">{tr('Correction requested')}</Badge>}
              </li>
            ))}
          </ul>
        </Collapse>
      )}

      <ExchangePanel id={id} defaultOpen={first === 'exchange'} />

      <Collapse id="p360-golden" title={tr('The golden record')} summary={tr('{n} fields, each chosen by a visible rule{c}.', { n: d.attributes.length, c: conflicts ? tr('; {v} where departments differ', { v: conflicts }) : '' })}>
        <p className="mdm-note">{tr('Each value was chosen by a visible rule. Where departments differ, the other values are listed so nothing is hidden.')}</p>
        <div className="dxk-table-wrap">
          <table className="mdm-table dxk-table">
            <thead><tr><th scope="col">{tr('Field')}</th><th scope="col">{tr('Value')}</th><th scope="col">{tr('Taken from')}</th><th scope="col">{tr('Rule')}</th></tr></thead>
            <tbody>
              {d.attributes.map((a) => (
                <tr key={a.attribute}>
                  <td>{ATTR_LABEL[a.attribute] || a.attribute}</td>
                  <td><strong>{a.value || '—'}</strong>{a.conflict && <> <Badge tone="warn">{tr('Departments differ')}</Badge></>}
                    {a.alternatives.length > 1 && (
                      <details className="mdm-evidence"><summary>{tr('All values seen ({length})', { length: a.alternatives.length })}</summary>
                        <ul className="mdm-plain">{a.alternatives.map((x, i) => <li key={i}>{x.value || '—'} <span className="mdm-sub">({x.source.replace(/_/g, ' ')})</span></li>)}</ul>
                      </details>)}
                  </td>
                  <td>{a.chosen_source?.replace(/_/g, ' ')}</td>
                  <td className="mdm-sub">{a.rule}</td>
                </tr>
              ))}
              {spouses.length > 0 && (
                <tr>
                  <td>{tr('Spouse')}</td>
                  <td>{spouses.map((r, i) => <span key={r.other.id}>{i > 0 && ', '}<button type="button" className="mdm-link strong" onClick={() => openPerson(r.other.id)}><Name text={r.other.name} /></button>{r.other.life_status === 'DECEASED' && <> <Badge tone="bad">{tr('Death registered')}</Badge></>}</span>)}</td>
                  <td>{[...new Set(spouses.map((r) => (r.source || 'household').replace(/_/g, ' ')))].join(', ')}</td>
                  <td className="mdm-sub">{SPOUSE_NOTE}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Collapse>

      <Collapse id="p360-family" title={tr('Family and household')} summary={members.length ? tr('{n} on ration card {cards}{o}.', { n: members.length, cards: hh.cards.join(', '), o: others.length ? tr(', {v} other link(s)', { v: others.length }) : '' }) : tr('Everyone on the same ration card, plus relatives linked by other systems.')}
>
        {members.length > 0 ? (
          <>
            <p className="p360-card">{tr('Ration card')} {hh.cards.map((c) => <code key={c}>{c}</code>)} {tr('· {length} member{v}', { length: members.length, v: members.length === 1 ? '' : 's' })}</p>
            <table className="mdm-table dxk-table tight">
              <thead><tr><th scope="col">{tr('Member')}</th><th scope="col">{tr('Relation to the head')}</th><th scope="col" className="num">{tr('Age')}</th><th scope="col">{tr('Status')}</th><th scope="col">{tr('Also in')}</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className={m.is_selected ? 'p360-self' : ''}>
                    <td>{m.is_selected ? <strong><Name text={m.name} /></strong> : <><button type="button" className="mdm-link strong" onClick={() => openPerson(m.id)}><Name text={m.name} /></button></>}{m.is_selected && <> <Badge tone="info">{tr('this person')}</Badge></>}<div className="mdm-sub">{m.mdm_id}</div></td>
                    <td>{m.relation || '—'}</td>
                    <td className="num">{m.age ?? '—'}</td>
                    <td>{m.life_status === 'DECEASED' ? <Badge tone="bad">{tr('Death registered')}</Badge> : <span className="mdm-sub">{tr('No death record')}</span>}</td>
                    <td>{[m.electricity && 'Electricity', m.housing && 'Housing', m.land && 'Land', m.tenant && 'Tenant'].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(hh.caveats || []).length > 0 && (
              <div className="p360-caveats"><strong>{tr('Where this view can mislead.')}</strong>
                <ul className="mdm-plain">{hh.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
            )}
          </>
        ) : <p className="mdm-note">{hh ? 'No ration card household was found for this person.' : 'Loading the household…'}</p>}
        {bparents.length > 0 && (
          <>
            <h4 className="p360-sub">{tr('Parents, from the birth registration')}</h4>
            <ul className="mdm-plain">
              {bparents.map((q) => <li key={q.role}><strong>{q.role}:</strong> <PartyName p={q} />{q.state === 'LINKED' && <span className="mdm-sub"> {tr('· recorded as a parent of {name}', { name: p.name })}</span>}</li>)}
            </ul>
            {d.birth_event_id && <p className="mdm-sub"><button type="button" className="mdm-link" onClick={() => nav(`/dx/lineage?tab=event&event=${d.birth_event_id}`)}>{tr('See the birth event')}</button></p>}
          </>
        )}
        {others.length > 0 && (
          <>
            <h4 className="p360-sub">{tr('Other family links from other systems')}</h4>
            <ul className="mdm-plain">
              {others.map((r, i) => (
                <li key={i}>
                  <strong>{RELATION_TEXT[r.role_of_other]}:</strong>{' '}
                  <button type="button" className="mdm-link" onClick={() => openPerson(r.other.id)}><Name text={r.other.name} /></button>
                  {r.other.life_status === 'DECEASED' && <> <Badge tone="bad">{tr('Death registered')}</Badge></>}
                  <span className="mdm-sub"> · {r.basis}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {!members.length && !others.length && !bparents.length && hh && <p className="mdm-note">{tr('No family links found. This means none of the systems connect this person to anyone else, which is different from having no family.')}</p>}
      </Collapse>

      <Collapse id="p360-lineage" title={tr('Where this came from')} summary={tr('Which departments supplied each value, and which one was chosen.')}>
        <PersonLineage personId={id} compact />
      </Collapse>

      <Collapse id="p360-departments" title={tr('Department details')} summary={tr('Connections, cards, bills, payments and benefits each department holds for this person, as the person sees them.')}>
        <DeptRecords personId={id} />
      </Collapse>

      <Collapse id="p360-records" title={tr('Department records ({v})', { v: d.records.length })} summary={tr('{n} record(s) from {s} system(s), with how each was linked.', { n: d.records.length, s: p.source_count })}>
        {Object.entries(bySource).map(([name, recs]) => (
          <div key={name} className="mdm-src-block">
            <h4>{name}</h4>
            {recs.map((r) => (
              <div key={r.id} className="mdm-rec">
                <div>
                  <strong><Name text={r.name} /></strong> <span className="mdm-sub">{r.rtype.replace(/_/g, ' ').toLowerCase()} · {r.source_rid}</span>
                  <div className="mdm-sub">{[r.dob && tr('born {v}', { v: r.dob }), r.age != null && tr('age {v}', { v: r.age }), r.gender, r.address && <Nm text={r.address} />, r.village && <Nm text={r.village} />, r.mandal && <Nm text={r.mandal} />, r.district && <Nm text={r.district} />].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</div>
                  <div><Badge tone={r.link_status === 'IN_REVIEW' ? 'warn' : r.link_status.startsWith('STEWARD') ? 'info' : 'neutral'}>{linkLabel(r.link_status)}</Badge>
                    {r.link_status === 'AUTO_LINKED' && <span className="mdm-sub"> {tr('match strength {Math}%', { Math: Math.round(Number(r.score) * 100) })}</span>}
                    {r.link_status === 'AUTO_LINKED' && (() => { const x = explainScore(r.evidence, match); return x ? <> <span title={x.sentence}><Badge tone={KIND_BADGE[x.kind][0]}>{KIND_BADGE[x.kind][1]}</Badge></span></> : null })()}</div>
                  {r.last_change && <div className="mdm-sub" title={tr('Full history is on the Data lineage page')}>{tr('Last linked or updated: {v} · {v2}', { v: changeText(r.last_change), v2: fmtTime(r.last_change.ts) })}</div>}
                  {r.link_status === 'AUTO_LINKED' && <Evidence ev={r.evidence} match={match} />}
                </div>
                {d.records.length > 1 && (
                  <button type="button" className="btn-secondary small" disabled={busy} onClick={() => openSeparate(r)}>{tr('Not this person')}</button>
                )}
              </div>
            ))}
          </div>
        ))}
        {d.missing_sources.length > 0 && (
          <details className="mdm-evidence">
            <summary>{tr('Systems with no record for this person ({length})', { length: d.missing_sources.length })}</summary>
            <p className="mdm-note">{tr('“No record” only means the system holds nothing that links here. It does not mean the person is not married, not entitled, or alive.')}</p>
            <ul className="mdm-plain">{d.missing_sources.map((m) => <li key={m.source}>{m.name}</li>)}</ul>
          </details>
        )}
      </Collapse>

      {d.audit.length > 0 && (
        <Collapse id="p360-audit" title={tr('Decisions about this person')} summary={tr('{v} recorded.', { v: d.audit.length })}>
          <ul className="mdm-plain">{d.audit.map((a) => <li key={a.seq}>{fmtDate(a.ts)} · {a.actor} · {a.action.replace(/_/g, ' ').toLowerCase()}{a.detail?.note ? ` — ${a.detail.note}` : ''}</li>)}</ul>
        </Collapse>
      )}

      <Drawer open={!!sep} onClose={closeSeparate} title={tr('Separate this record from the person')} subtitle={sep ? `${sep.source_name} · ${sep.source_rid}` : undefined}>
        {sep && (
          <div className="p360-sep">
            <h3>{tr('The record')}</h3>
            <Facts items={[
              ['Department', sep.source_name],
              ['Record', `${sep.rtype.replace(/_/g, ' ').toLowerCase()} · ${sep.source_rid}`],
              ['Name on the record', <Name text={sep.name} />],
              ['Details', [sep.dob && tr('born {v}', { v: sep.dob }), sep.age != null && tr('age {v}', { v: sep.age }), sep.gender, sep.address && <Nm text={sep.address} />, sep.village && <Nm text={sep.village} />, sep.mandal && <Nm text={sep.mandal} />, sep.district && <Nm text={sep.district} />].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)],
              ['How it was linked', `${linkLabel(sep.link_status)}${sep.link_status === 'AUTO_LINKED' ? tr(', match strength {v}', { v: pc(sep.score) }) : ''}`],
              ['Currently on', <><Name text={p.name} /> · {p.mdm_id}</>],
            ]} />
            {sep.evidence?.components && (
              <>
                <h3>{tr('Why the system linked it')}</h3>
                <EvidenceTable ev={sep.evidence} match={match} />
              </>
            )}
            <h3>{tr('What happens when you confirm')}</h3>
            <ul className="mdm-plain p360-sep-list">
              <li>{tr('The record becomes')} <strong>{tr('its own person')}</strong> {tr('with a new master id, and {name} keeps the other {v} record{v2}.', { name: p.name, v: d.records.length - 1, v2: d.records.length - 1 === 1 ? '' : 's' })}</li>
              <li>{tr('Both golden records and the match confidence are worked out again.')}</li>
              <li>{tr('The record is marked')} <em>{tr('kept separate by a steward')}</em>{tr(', so automatic matching will not join it back.')}</li>
              <li>{tr('Nothing changes in {source_name}. Departments remain the source of truth.', { source_name: sep.source_name })}</li>
              <li>{tr('The decision, your name and the reason below go into the audit log, which cannot be edited.')}</li>
            </ul>
            <label className="mdm-field">
              <span>{tr('Why is this not the same person? (required)')}</span>
              <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('For example: different father\'s name and a different village on the land record')} maxLength={500} />
            </label>
            {sepErr && <Banner tone="bad">{sepErr}</Banner>}
            <div className="p360-sep-actions">
              <button type="button" className="btn-primary" disabled={busy || reason.trim().length < 5} onClick={confirmSeparate}>{busy ? 'Separating…' : 'Separate this record'}</button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={closeSeparate}>{tr('Cancel')}</button>
            </div>
            {reason.trim().length < 5 && <p className="mdm-sub">{tr('Give a reason of at least a few words to continue.')}</p>}
          </div>
        )}
      </Drawer>
    </div>
  )
}

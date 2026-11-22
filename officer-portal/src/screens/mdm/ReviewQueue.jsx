import { genderText } from '../../gender'
import { useEffect, useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager } from './shared'
import { COMPONENT_LABELS } from './labels'
import { DataTable, FilterSelect, Banner, Hero, Collapse, Facts } from '../dx/dxKit'
import { ScoreTip, pc, DEFAULT_MATCH } from './MatchScore'
import './matchscore.css'
import './review.css'
import PersonPeek, { MdmIdLink } from './PersonPeek'
import { tr } from '../../i18n/lang'

function EvidenceTable({ ev }) {
  if (!ev?.components) return null
  return (
    <table className="mdm-table tight">
      <thead><tr><th>{tr('Compared')}</th><th className="num">{tr('Agreement')}</th><th>{tr('Detail')}</th></tr></thead>
      <tbody>
        {Object.entries(ev.components).filter(([, c]) => c.score != null).map(([k, c]) => (
          <tr key={k}><td>{COMPONENT_LABELS[k] || k}</td><td className="num"><Badge tone={c.score >= 0.8 ? 'ok' : c.score >= 0.4 ? 'warn' : 'bad'}>{Math.round(c.score * 100)}%</Badge></td><td className="mdm-sub">{c.note}</td></tr>
        ))}
      </tbody>
    </table>
  )
}

const NONE = <span className="mdm-sub">{tr('not supplied')}</span>
const uniq = (xs) => [...new Set(xs.filter(Boolean))]
const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const bornText = (r) => r.dob || (r.birth_year ? `born ${r.birth_year}` : r.age != null ? `age ${r.age}` : '')

// what each column of the comparison shows for the record to place, and for a candidate (read from the person and all the records already linked to them)
const rowsFor = (t, cands) => {
  const v = t.view
  const place = { born: bornText(v), gender: genderText(v.gender), address: v.address, spouse: v.spouse, family: (v.family || []).join(', '), card: v.ration_card, mobile: v.mobile, name: v.name }
  const cand = cands.map((c) => {
    const rs = c.records || []
    return { name: c.person.name, born: c.person.dob || (c.person.birth_year ? `born ${c.person.birth_year}` : ''), gender: genderText(c.person.gender),
      address: [c.person.address, ...rs.map((r) => r.address)].find(Boolean) || [c.person.village, c.person.mandal, c.person.district].filter(Boolean).join(', '),
      spouse: uniq([...(c.person.spouses || []), ...rs.map((r) => r.spouse)]).join(', '), family: uniq(rs.flatMap((r) => r.family || [])).join(', '),
      card: uniq(rs.map((r) => r.ration_card)).join(', '), mobile: uniq(rs.map((r) => r.mobile)).join(', ') }
  })
  return { place, cand }
}
// Deciding fields first. The number is the share of the match score the field carries (0 = shown for the reviewer, not scored).
const FIELDS = [['name', 'Name', 40], ['born', 'Born / age', 25], ['address', 'Full address', 15], ['family', 'Parents / family', 10],
  ['gender', 'Gender', 5], ['spouse', 'Spouse', 0], ['card', 'Ration card', 0], ['mobile', 'Mobile number', 0]]
const FIELD_NAME = Object.fromEntries(FIELDS.map(([k, l]) => [k, l.toLowerCase()]))
const year = (x) => (String(x).match(/\b(1[89]\d\d|20\d\d)\b/) || [])[1]
const toks = (x) => norm(x).split(' ').filter(Boolean)
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1)
const listText = (xs) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

// match | differ | missing (one side does not supply it) | none (neither does)
function verdict(key, a, b) {
  if (!a && !b) return 'none'
  if (!a || !b) return 'missing'
  if (key === 'born') return (year(a) && year(a) === year(b)) || norm(a) === norm(b) ? 'match' : 'differ'      // a bare year agrees with a full date in that year
  if (key === 'address') {
    const x = new Set(toks(a)), y = toks(b)
    return y.filter((w) => x.has(w)).length / Math.max(1, Math.min(x.size, y.length)) >= 0.6 ? 'match' : 'differ'
  }
  if (key === 'family') { const A = new Set(String(a).split(',').map(norm)); return String(b).split(',').map(norm).some((n) => n && A.has(n)) ? 'match' : 'differ' }
  return norm(a) === norm(b) ? 'match' : 'differ'
}
const VERDICT = { match: ['✔ Matches', 'cmp-same'], differ: ['✖ Differs', 'cmp-diff'], missing: ['Not supplied on one side', ''], none: ['Neither side supplies it', ''] }

// Reads the evidence the matcher stored for the record: what agreed, what disagreed, and what could not be compared.
function Why({ t }) {
  const comps = t.evidence?.components
  if (!comps) return null
  const L = (k) => (COMPONENT_LABELS[k] || k).toLowerCase()
  const used = Object.entries(comps)
  const agreed = used.filter(([, c]) => c.score != null && c.score >= 0.8).map(([k]) => L(k))
  const differ = used.filter(([, c]) => c.score != null && c.score < 0.4).map(([k]) => L(k))
  const missing = used.filter(([, c]) => c.score == null).map(([k]) => L(k))
  const lost = Math.round(used.filter(([, c]) => c.score == null).reduce((n, [, c]) => n + (c.weight || 0), 0) * 100)
  return (
    <Collapse id="rv-why" title={tr('Why this needs a person')} summary={`${agreed.length} field${agreed.length === 1 ? '' : 's'} agree, ${differ.length} differ, ${missing.length} could not be compared.`}>
      <ul className="why-list">
        {agreed.length > 0 && <li><Badge tone="ok">{tr('Agrees')}</Badge><span>{cap(listText(agreed))} {agreed.length > 1 ? 'match' : 'matches'}.</span></li>}
        {differ.length > 0 && <li><Badge tone="bad">{tr('Differs')}</Badge><span>{tr('{v} {v2} not match.', { v: cap(listText(differ)), v2: differ.length > 1 ? 'do' : 'does' })}</span></li>}
        {missing.length > 0 && <li><Badge tone="warn">{tr('Missing')}</Badge><span>{tr('{v} could not be compared, because the record or the person it matched does not supply {v2}{v3}.', { v: cap(listText(missing)), v2: missing.length > 1 ? 'them' : 'it', v3: lost ? ` (${lost}% of the evidence)` : '' })}</span></li>}
      </ul>
      <p className="mdm-note">{tr('The match is {Math}%, below the level at which the system links on its own. {v}', { Math: Math.round(Number(t.score) * 100), v: missing.length > 0 ? 'More information from the department, or another record for this person, would settle it.' : 'The fields that exist disagree enough that it needs a human judgement.' })}</p>
    </Collapse>
  )
}

// A suggestion only: a person still decides, and their reason goes to the audit log.
function recommend(t, cands) {
  if (!cands.length) return null
  const { place, cand } = rowsFor(t, cands)
  const an = cands.map((c, i) => ({ i, score: Number(c.score), v: Object.fromEntries(FIELDS.map(([k]) => [k, verdict(k, place[k], cand[i][k])])) }))
    .sort((x, y) => y.score - x.score)
  const best = an[0], second = an[1]
  const of = (v, ...ks) => ks.filter((k) => best.v[k] === v)
  const differs = of('differ', 'born', 'gender')
  const agree = of('match', 'name', 'born', 'address', 'family')
  const short = of('missing', 'born', 'address', 'family').concat(of('none', 'born', 'address', 'family'))
  const who = cands[best.i].person.name
  if (differs.length) return { action: 'SEPARATE', title: 'Keep as a separate person', cand: best.i,
    why: `${listText(differs.map((k) => FIELD_NAME[k]))} ${differs.length > 1 ? 'differ' : 'differs'} from ${who}, and a true match would not differ on ${differs.length > 1 ? 'those' : 'that'}.`,
    note: `Kept separate: ${listText(differs.map((k) => FIELD_NAME[k]))} differ from ${who}.` }
  if (second && best.score - second.score < 0.1) return { action: 'HOLD', title: 'Not yet: two candidates are close', cand: null,
    why: `${who} and ${cands[second.i].person.name} score within ${Math.round((best.score - second.score) * 100)} points of each other. Check parents and address, or the department's own records, before choosing.`,
    note: 'Left for now: two candidates are almost equally likely; waiting for parents or address.' }
  if (best.v.name === 'match' && agree.length >= 3) return { action: 'LINK', title: 'Likely the same person: link', cand: best.i,
    why: `${listText(agree.map((k) => FIELD_NAME[k]))} all agree with ${who}, and nothing contradicts it.`,
    note: `Linked: ${listText(agree.map((k) => FIELD_NAME[k]))} agree with ${who}.` }
  return { action: 'HOLD', title: 'Not enough evidence yet: hold', cand: null,
    why: `${agree.length ? `${listText(agree.map((k) => FIELD_NAME[k]))} agree` : 'Nothing confirms the match'}, but ${short.length ? `${listText(short.map((k) => FIELD_NAME[k]))} ${short.length > 1 ? 'are' : 'is'} missing on one side` : 'the evidence is thin'}. Linking now would be a guess; so would separating.`,
    note: `Left for now: ${short.length ? listText(short.map((k) => FIELD_NAME[k])) + ' not available' : 'evidence is thin'}; asked the department for more.` }
}

function Suggestion({ rec, setNote, open }) {
  if (!rec) return null
  const tone = rec.action === 'LINK' ? 'ok' : rec.action === 'SEPARATE' ? 'warn' : 'info'
  return (
    <Collapse id="rv-suggest" title={tr('Suggested next step')} summary={rec.title}>
      <p><Badge tone={tone}>{rec.title}</Badge></p>
      <p>{cap(rec.why)}</p>
      <p className="mdm-sub">{tr('This is a suggestion from the evidence above, not a decision. You decide, and the reason you give is written to the audit log.')}</p>
      {open && <button type="button" className="btn-secondary small" onClick={() => setNote(rec.note)}>{tr('Use this as my reason')}</button>}
    </Collapse>
  )
}

function Compare({ t, onPeek }) {
  const cands = t.candidate_details
  const [showAll, setShowAll] = useState(false)
  const { place, cand } = rowsFor(t, cands)
  const rows = FIELDS.map(([k, label, w]) => ({ k, label, w, v: cand.map((c) => verdict(k, place[k], c[k])) }))
  const shown = showAll ? rows : rows.filter((r) => place[r.k] || cand.some((c) => c[r.k]))
  const hidden = rows.length - shown.length
  const tally = cand.map((_, i) => {
    const n = { match: 0, differ: 0, gap: 0 }
    rows.forEach((r) => { const v = r.v[i]; if (v === 'match') n.match++; else if (v === 'differ') n.differ++; else if (v === 'missing') n.gap++ })
    return n
  })
  if (!cands.length) return <Collapse id="rv-compare" title={tr('Side by side')} summary={tr('No other person is close enough to compare with.')}><p className="mdm-note">{tr('No other person is close enough to compare with. This record would start a new person.')}</p></Collapse>
  return (
    <Collapse id="rv-compare" title={tr('Side by side')} summary={`${cands.length} candidate${cands.length === 1 ? '' : 's'} compared with the record, field by field.`}>
      <p className="mdm-note">{tr('Each row says whether the candidate agrees with the record to place. The deciding fields are first; “Counts for” is the share of the match score each carries. A mobile number or spouse appears only if a department supplies one.')}</p>
      <div className="dxk-table-wrap">
        <table className="mdm-table cmp-table">
          <thead>
            <tr>
              <th scope="col">{tr('Compared')}</th>
              <th scope="col" className="num">{tr('Counts for')}</th>
              <th scope="col" className="cmp-place">{tr('Record to place')}<div className="mdm-sub">{t.source_name} · {t.source_rid}</div></th>
              {cands.map((c, i) => (
                <th scope="col" key={c.person.id}>{c.tentative ? 'Currently grouped with' : `Candidate ${i + 1}`} · {Math.round(c.score * 100)}%
                  <div className="mdm-sub"><MdmIdLink id={c.person.id} mdmId={c.person.mdm_id} onPeek={onPeek} /> {tr('· in {source_count} system(s)', { source_count: c.person.source_count })}</div>
                  <div className="cmp-tally"><span className="t-ok">{tr('{match} match', { match: tally[i].match })}</span> · <span className="t-bad">{tr('{differ} differ', { differ: tally[i].differ })}</span> · <span>{tr('{gap} missing', { gap: tally[i].gap })}</span></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.k}>
                <th scope="row">{r.label}</th>
                <td className="num mdm-sub">{r.w ? `${r.w}%` : 'not scored'}</td>
                <td className="cmp-place">{place[r.k] || NONE}</td>
                {cand.map((c, i) => {
                  const [txt, cls] = VERDICT[r.v[i]]
                  return <td key={i} className={cls}>{c[r.k] || NONE}<div className="cmp-verdict">{txt}</div></td>
                })}
              </tr>
            ))}
            <tr>
              <th scope="row">{tr('Held by (sources)')}</th><td />
              <td className="cmp-place">{t.source_name}</td>
              {cands.map((c) => <td key={c.person.id}>{uniq(c.records.map((r) => r.source_name)).join(', ') || NONE}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {(hidden > 0 || showAll) && (
        <button type="button" className="mdm-link" onClick={() => setShowAll((x) => !x)}>
          {showAll ? 'Hide fields that nobody supplies' : `Show ${hidden} field${hidden > 1 ? 's' : ''} that nobody supplies`}
        </button>
      )}
    </Collapse>
  )
}

function Decide({ id, back, done, fromPerson, openPerson }) {
  const { data: t, error, loading } = useMdm(`/review/${id}`, undefined, [id])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [peek, setPeek] = useState(null)
  const { data: rulesData } = useMdm('/rules', undefined, [])
  const match = rulesData?.active?.match ? { ...DEFAULT_MATCH, ...rulesData.active.match } : DEFAULT_MATCH
  if (!t) return <Status loading={loading} error={error} />

  const submit = async (decision, person_id) => {
    setBusy(true); setErr(null)
    try {
      const res = await mdm(`/review/${id}/decision`, { method: 'POST', body: { decision, person_id, note: note.trim() || null } })
      done(res)
    } catch (e) { setErr(e.message); setBusy(false) }
  }
  const open = t.status === 'OPEN'
  const v = t.view
  const rec = recommend(t, t.candidate_details)
  const placeLine = [bornText(v), genderText(v.gender), v.address, v.spouse && `spouse ${v.spouse}`, v.family?.length && `parents/family: ${v.family.join(', ')}`, v.ration_card && `ration card ${v.ration_card}`, v.mobile && `mobile ${v.mobile}`].filter(Boolean).join(' · ')
  const tip = (sc, ev) => <ScoreTip score={sc} ev={ev} match={match}>{pc(sc)}</ScoreTip>
  return (
    <div className="mdm-stack rv">
      <Hero eyebrow={<>{tr('Steward review · {v}', { v: open ? 'waiting for a decision' : 'decided' })}</>}
        title={<>{t.name}</>}
        text={`${t.source_name} · ${t.source_rid}${placeLine ? ` · ${placeLine}` : ''}`}
        actions={<>
          <button type="button" className="dxk-back" onClick={back}>{tr('← Back to the queue')}</button>{' '}
          {fromPerson && <button type="button" className="dxk-back" onClick={() => openPerson(fromPerson)}>{tr('← Back to the person')}</button>}
        </>}
        aside={<>
          <div className="dxk-hero-fig"><strong>{pc(t.score)}</strong><span>{tr('best candidate')}</span></div>
          <div className="dxk-hero-fig"><strong>{t.candidate_details.length}</strong><span>{t.candidate_details.length === 1 ? 'candidate' : 'candidates'}</span></div>
          <div className="dxk-hero-fig"><span className={`dxk-pill tone-${open ? 'warn' : 'ok'}`}>{open ? 'Open' : t.decision === 'LINK' ? 'Linked' : 'Kept separate'}</span><span>{tr('status')}</span></div>
        </>} />

      <Collapse id="rv-record" defaultOpen title={tr('Record to place')} summary={`${t.name} · ${t.source_name}`}>
        <Facts items={[
          ['Name', t.name], ['System', t.source_name], ['Record number', t.source_rid],
          ['Born / age', bornText(v) || undefined], ['Gender', genderText(v.gender)], ['Address', v.address],
          ['Spouse', v.spouse], ['Parents / family', v.family?.length ? v.family.join(', ') : undefined], ['Ration card', v.ration_card], ['Mobile', v.mobile],
        ]} />
        <p className="mdm-note rv-score">{tr('{v}. Best candidate agreement: {v2}.', { v: cap(t.reason), v2: tip(t.score, t.evidence) })}</p>
        <div className="rv-scale" aria-label={`Score ${pc(t.score)} against the thresholds`}>
          <div className="rv-scale-bar"><span className="rv-scale-fill" style={{ width: pc(t.score) }} /><i style={{ left: pc(match.review) }} title={`Steward decides from ${pc(match.review)}`} /><i className="auto" style={{ left: pc(match.auto) }} title={`Links automatically from ${pc(match.auto)}`} /></div>
          <div className="rv-scale-key"><span>0%</span><span>{tr('{v} steward decides', { v: pc(match.review) })}</span><span>{tr('{v} links automatically', { v: pc(match.auto) })}</span><span>100%</span></div>
        </div>
      </Collapse>

      <Why t={t} />
      <Compare t={t} onPeek={setPeek} />
      <Suggestion rec={rec} setNote={setNote} open={open} />

      {t.candidate_details.map((c, i) => (
        <Collapse key={c.person.id} id={`rv-cand-${i}`}
          title={<>{c.tentative ? 'Currently grouped with' : `Candidate ${i + 1}`}: {c.person.name} {rec?.cand === i && <Badge tone={rec.action === 'LINK' ? 'ok' : 'warn'}>{tr('Suggested')}</Badge>}</>}
          summary={`${pc(c.score)} agreement · ${c.person.mdm_id} · in ${c.person.source_count} system(s) · ${c.records.length} record(s)`}
          actions={open ? <button type="button" className="btn-primary small" disabled={busy} onClick={() => submit('LINK', c.person.id)}>{c.tentative ? 'Same person — confirm this link' : 'Same person — link'}</button> : null}>
          <p className="mdm-sub"><MdmIdLink id={c.person.id} mdmId={c.person.mdm_id} onPeek={setPeek} /> {tr('· {v} · in {source_count} system(s)', { v: [c.person.dob ? `born ${c.person.dob}` : c.person.birth_year && `born ${c.person.birth_year}`, genderText(c.person.gender), c.person.village, c.person.mandal, c.person.district].filter(Boolean).join(' · '), source_count: c.person.source_count })}</p>
          <p className="mdm-note">{tr('Agreement with the record to place: {v}', { v: tip(c.score, c.evidence) })}</p>
          <EvidenceTable ev={c.evidence} />
          <details className="mdm-evidence" open><summary>{tr('Records already linked to this person ({length}), and the system each comes from', { length: c.records.length })}</summary>
            <div className="dxk-table-wrap"><table className="mdm-table tight">
              <thead><tr><th scope="col">{tr('System')}</th><th scope="col">{tr('Name')}</th><th scope="col">{tr('Born / age')}</th><th scope="col">{tr('Address')}</th><th scope="col">{tr('Spouse / family')}</th><th scope="col">{tr('Mobile')}</th></tr></thead>
              <tbody>
                {c.records.map((r, j) => (
                  <tr key={j}>
                    <td><strong>{r.source_name}</strong><div className="mdm-sub">{r.source_rid}</div></td>
                    <td>{r.name}</td><td>{bornText(r) || '—'}</td><td>{r.address || '—'}</td>
                    <td>{[r.spouse && `spouse ${r.spouse}`, ...(r.family || [])].filter(Boolean).join(', ') || '—'}</td><td>{r.mobile || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </details>
        </Collapse>
      ))}

      {open ? (
        <Collapse id="rv-decide" title={tr('Your decision')} summary={tr('Add a note for the audit log, or keep this record as a separate person.')}
          actions={<button type="button" className="btn-secondary small" disabled={busy} onClick={() => submit('SEPARATE')}>{tr('None of these — keep as a separate person')}</button>}>
          <label className="mdm-field"><span>{tr('Note for the audit log (optional)')}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={tr('For example: father and son with the same name; DOB differs')} />
          </label>
        </Collapse>
      ) : <p className="mdm-note">{tr('Decided by {decided_by}: {v}.', { decided_by: t.decided_by, v: t.decision === 'LINK' ? 'linked' : 'kept separate' })}</p>}
      {open && err && <Banner tone="bad">{err}</Banner>}
      <PersonPeek id={peek} onClose={() => setPeek(null)} />
    </div>
  )
}

export default function ReviewQueue({ initialSource, initialQuery = '', autoOpen = false, fromPerson = '', openPerson = () => {} }) {
  const [source, setSource] = useState(initialSource || '')
  const [offset, setOffset] = useState(0)
  const [sel, setSel] = useState(null)
  const [tick, setTick] = useState(0)
  const [q, setQ] = useState(initialQuery)
  const [decided, setDecided] = useState(null)
  const [autoDone, setAutoDone] = useState(false)
  const [limit, setLimit] = useState(20)
  const [district, setDistrict] = useState('')
  const [village, setVillage] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' })
  const params = { status: 'OPEN', source, q: q.trim(), district, village, date_from: from, date_to: to, limit, offset, sort: sort.key, dir: sort.dir }
  const { data, error, loading } = useMdm('/review', params, [tick, JSON.stringify(params)])
  const { data: srcs } = useMdm('/sources')
  const { data: facets } = useMdm('/review/facets', { district }, [district, tick])
  useEffect(() => {      // arriving from a person's page: open the one record that was asked for
    if (autoOpen && !autoDone && data && !loading) {
      setAutoDone(true)
      if (data.items.length === 1) setSel(data.items[0].id)
    }
  }, [autoOpen, autoDone, data, loading])
  const { data: rulesData } = useMdm('/rules', undefined, [])
  const match = rulesData?.active?.match ? { ...DEFAULT_MATCH, ...rulesData.active.match } : DEFAULT_MATCH
  const any = !!(source || q || district || village || from || to)
  const reset = () => { setSource(''); setQ(''); setDistrict(''); setVillage(''); setFrom(''); setTo(''); setOffset(0) }

  if (sel) return <Decide id={sel} fromPerson={fromPerson} openPerson={openPerson} back={() => setSel(null)} done={(res) => { setSel(null); setDecided(res || null); setTick((n) => n + 1) }} />
  return (
    <div className="mdm-stack rv">
      <Hero eyebrow={tr('Steward review')}
        title={tr('Doubtful matches waiting for a person')}
        text={tr('These records look like someone already known, but not certainly. Compare them, decide, and the decision is written to the audit log. Strongest matches come first.')}
        actions={decided?.person_id ? <button type="button" className="dxk-back" onClick={() => openPerson(decided.person_id)}>{tr('Open this person →')}</button>
          : fromPerson ? <button type="button" className="dxk-back" onClick={() => openPerson(fromPerson)}>{tr('← Back to the person')}</button> : null}
        aside={data ? <>
          <div className="dxk-hero-fig"><strong>{data.total.toLocaleString('en-IN')}</strong><span>{any ? 'match this search' : 'waiting'}</span></div>
          <div className="dxk-hero-fig"><strong>{pc(match.review)}–{pc(match.auto)}</strong><span>{tr('steward range')}</span></div>
        </> : null} />
      <Banner tone="info">{tr('A score of')} <strong>{tr('{v} or more', { v: pc(match.auto) })}</strong> {tr('links on its own. These records scored between')} <strong>{tr('{v} and {v2}', { v: pc(match.review), v2: pc(match.auto) })}</strong> {tr('(or had two close candidates), so they are too uncertain to link and too close to ignore. Open one to see why, side by side.')}</Banner>
      {decided && (
        <Banner tone="ok">
          {tr('{v} The decision is in the audit log.', { v: decided.decision === 'LINK' ? 'Linked: the record now belongs to the person it was matched with. If it was the only record of the person you came from, that empty person no longer exists.' : 'Kept as a separate person.' })}{' '}
          {decided.person_id && <button type="button" className="mdm-link strong" onClick={() => openPerson(decided.person_id)}>{tr('Open this person →')}</button>}
        </Banner>
      )}
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={{ total: data.total, limit, offset, onPage: setOffset, onLimit: (n) => { setLimit(n); setOffset(0) }, pageSizes: [10, 20, 50, 100],
          sort, onSort: (key, dir) => { setSort({ key, dir }); setOffset(0) } }}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300}
          search={{ placeholder: 'Search the whole queue by name, record number, place or ration card' }}
          canClear={any} onClear={reset}
          filters={<>
            <FilterSelect label={tr('System')} value={source} onChange={(v) => { setSource(v); setOffset(0) }} options={(srcs || []).map((s) => [s.source, s.name])} all="All systems" />
            <FilterSelect label={tr('District')} value={district} onChange={(v) => { setDistrict(v); setVillage(''); setOffset(0) }} all="All districts" options={(facets?.districts || []).map((d) => [d.value, `${d.value} (${d.n})`])} />
            <FilterSelect label={tr('Village')} value={village} onChange={(v) => { setVillage(v); setOffset(0) }} all={district ? 'All villages' : 'Pick a district first'} options={(facets?.villages || []).map((d) => [d.value, `${d.value} (${d.n})`])} />
            <div className="dxk-filter dxk-daterange"><span>{tr('Born between')}</span>
              <div className="dxk-dates">
                <input type="date" value={from} max={to || undefined} aria-label={tr('Born from')} onChange={(e) => { setFrom(e.target.value); setOffset(0) }} />
                <em>{tr('to')}</em>
                <input type="date" value={to} min={from || undefined} aria-label={tr('Born to')} onChange={(e) => { setTo(e.target.value); setOffset(0) }} />
              </div></div>
          </>}
          onRowClick={(r) => setSel(r.id)} empty={any ? 'Nothing waiting that matches this search. Clear it to see the whole queue.' : 'Nothing waiting. Every doubtful match has been settled.'}
          columns={[
            { key: 'name', sortKey: 'name', label: 'Record', render: (r) => <><strong>{r.name}</strong><div className="mdm-sub">{r.source_rid}</div></> },
            { key: 'source_name', sortKey: 'source_name', label: 'System', render: (r) => <Badge tone="info">{r.source_name}</Badge> },
            { key: 'dob', sortKey: 'dob', label: 'Born / age', render: (r) => r.dob || (r.age != null ? `age ${r.age}` : '—') },
            { key: 'district', sortKey: 'district', label: 'Place', render: (r) => [r.village, r.mandal, r.district].filter(Boolean).join(', ') || '—' },
            { key: 'score', sortKey: 'score', label: 'Best match', align: 'num', render: (r) => <span className="rv-meter"><span className="rv-meter-bar"><i style={{ width: pc(r.score) }} /></span><b>{pc(r.score)}</b></span> },
            { key: 'candidate_count', sortKey: 'candidate_count', label: 'Candidates', align: 'num' },
            { key: 'go', label: '', sort: false, render: (r) => <button type="button" className="btn-secondary small rv-open" onClick={(e) => { e.stopPropagation(); setSel(r.id) }}>{tr('Review')}</button> },
          ]} />
      )}
    </div>
  )
}

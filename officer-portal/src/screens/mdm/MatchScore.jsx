import { COMPONENT_LABELS } from './labels'
import { tr } from '../../i18n/lang'

/* How a match score is made, in words and in a table: shared by the person page and the review screen. */
export const pc = (v) => `${Math.round(Number(v) * 100)}%`
export const DEFAULT_MATCH = { auto: 0.76, review: 0.56, info_needed: 0.7, dob_mismatch_factor: 0.45, gender_mismatch_factor: 0.3, district_mismatch_factor: 0.6, same_source_conflict_factor: 0.6 }
const PENALTY_FACTOR = { 'date of birth mismatch': 'dob_mismatch_factor', 'gender mismatch': 'gender_mismatch_factor', 'district mismatch': 'district_mismatch_factor', 'same source already in cluster': 'same_source_conflict_factor' }
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

/** What a stored match score is made of, in words: which fields were compared, whether the evidence was thin, and what reduced it. */
export function explainScore(ev, m = DEFAULT_MATCH) {
  const comps = ev?.components
  if (!comps) return null
  const used = Object.entries(comps).filter(([, c]) => c.score != null)
  const missing = Object.entries(comps).filter(([, c]) => c.score == null).map(([k]) => (COMPONENT_LABELS[k] || k).toLowerCase())
  const lower = used.filter(([, c]) => c.score < 1).sort((x, y) => x[1].score - y[1].score).map(([k, c]) => `${(COMPONENT_LABELS[k] || k).toLowerCase()} (${pc(c.score)})`)
  const capped = ev.cap != null && ev.cap < 1
  const penalties = (ev.penalties || []).map((t) => ({ text: t, factor: m[PENALTY_FACTOR[t]] }))
  const kind = penalties.length ? 'conflict' : capped ? 'thin' : 'strong'
  const have = used.map(([k]) => (COMPONENT_LABELS[k] || k).toLowerCase())
  const sentence = kind === 'conflict'
    ? `Evidence conflicts: ${list(penalties.map((x) => x.text))}${lower.length ? `; lower agreement on ${list(lower)}` : ''}.`
    : kind === 'thin'
      ? `Thin evidence: the record gives only ${list(have)}, with no ${list(missing)} to compare. Everything it does give ${lower.length ? `agrees, apart from ${list(lower)}` : 'agrees'}, but the score is capped at ${pc(ev.cap)} because only ${Number(ev.info_weight).toFixed(2)} of the ${Number(m.info_needed).toFixed(2)} of evidence needed was available.`
      : `Strong evidence: ${list(have)} were compared${lower.length ? `; the score is lower on ${list(lower)}` : ' and all agree'}.`
  return { kind, capped, penalties, missing, lower, have, sentence }
}
export const KIND_BADGE = { strong: ['ok', 'Strong evidence'], thin: ['info', 'Thin evidence'], conflict: ['warn', 'Conflicting evidence'] }

export function EvidenceTable({ ev, match }) {
  const comps = ev?.components
  if (!comps) return null
  const x = explainScore(ev, match)
  const m = match || DEFAULT_MATCH
  return (
    <>
      <table className="mdm-table tight">
        <thead><tr><th scope="col">{tr('Field')}</th><th scope="col" className="num">{tr('Agreement')}</th><th scope="col" className="num" title={tr('How much this field counts toward the score')}>{tr('Weight')}</th><th scope="col">{tr('Note')}</th></tr></thead>
        <tbody>
          {Object.entries(comps).map(([k, c]) => (
            <tr key={k}>
              <td>{COMPONENT_LABELS[k] || k}</td>
              <td className="num">{c.score == null ? 'not on record' : pc(c.score)}</td>
              <td className="num mdm-sub">{c.score == null ? 'left out' : Number(c.weight).toFixed(2)}</td>
              <td className="mdm-sub">{c.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {x && (
        <div className="p360-calc">
          <p><strong>{tr('How the score is built.')}</strong> {tr('The agreements above are averaged by their weights, using only the fields the record has.')}</p>
          {ev.info_weight != null && <p>{tr('Evidence available:')} <strong>{Number(ev.info_weight).toFixed(2)}</strong> {tr('of the')} <strong>{Number(m.info_needed).toFixed(2)}</strong> {tr('needed for a full score')}{x.capped ? <>{tr(', so the score is capped at')} <strong>{pc(ev.cap)}</strong>.</> : '. Nothing is capped.'}</p>}
          {x.penalties.length > 0 && <p>{tr('Reduced because:')} {x.penalties.map((q) => `${q.text}${q.factor != null ? ` (×${q.factor})` : ''}`).join('; ')}.</p>}
          <p className="mdm-sub">{tr('Final match score')} <strong>{ev.total != null ? pc(ev.total) : '—'}</strong>{tr('. A score of {v} or more links automatically; {v2} to {v3} goes to a steward.', { v: pc(m.auto), v2: pc(m.review), v3: pc(m.auto - 0.0001) })}</p>
        </div>
      )}
    </>
  )
}


/** A score with its working on hover or keyboard focus: the fields compared, their weights, any cap or penalty, and where it sits against the thresholds. */
export function ScoreTip({ score, ev, match, children }) {
  const m = match || DEFAULT_MATCH
  const x = explainScore(ev, m)
  return (
    <span className="mscore" tabIndex={0}>
      <span className="mscore-val">{children ?? pc(score)}</span><span className="mscore-i" aria-hidden="true">ⓘ</span>
      <span className="mscore-tip" role="tooltip">
        <strong className="mscore-h">{tr('How {v} is worked out', { v: pc(score) })}</strong>
        {x ? (
          <>
            <span className="mscore-sent">{x.sentence}</span>
            <EvidenceTable ev={ev} match={m} />
          </>
        ) : <span className="mscore-sent">{tr('The detailed working was not kept for this record.')}</span>}
      </span>
    </span>
  )
}

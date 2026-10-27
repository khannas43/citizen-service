import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Tag, OUTCOME, PersonPicker, fmtTime } from './dxShared'

const PARAM = { limit: ['Income limit (rupees a year)', '200000'], category: ['Category', 'OBC'], years: ['Age in years', '18'] }

export function Explain({ r }) {
  const tone = { ANSWERED: 'ok', CONFLICT: 'bad', NO_RECORD: '', EXPIRED_SOURCE: 'warn', DENIED_NO_CONSENT: 'warn', DENIED_POLICY: 'warn' }[r.outcome] ?? ''
  return (
    <section className={`mdm-card dx-result ${tone}`} aria-live="polite">
      <h3>Result</h3>
      <p><Tag map={OUTCOME} value={r.outcome} /></p>
      {r.outcome === 'ANSWERED' && (
        <>
          <p className="dx-big">{String(r.answer).replace(/_/g, ' ')}</p>
          <dl className="dx-kv">
            {r.band && <><dt>Income band</dt><dd>{r.band}</dd></>}
            {r.valid_until && <><dt>Valid until</dt><dd>{r.valid_until}</dd></>}
            {r.source && <><dt>Source</dt><dd>{r.source}</dd></>}
          </dl>
        </>
      )}
      {r.message && <p className="mdm-note">{r.message}</p>}
      <p className="mdm-sub">Only the outcome is returned. No amount, certificate or document leaves the department. This exchange is recorded as ledger entry {r.ledger_id}{r.consent_id ? `, under consent ${r.consent_id}` : ''}, using policy versions {Object.entries(r.policy_versions || {}).filter(([, v]) => v > 1).map(([k, v]) => `${k} v${v}`).join(', ') || 'all at version 1'}.</p>
    </section>
  )
}

/** Ask a department-style question about a person. The platform answers with an outcome and never hands over the record. */
export default function DxVerify() {
  const nav = useNavigate()
  const { data: purposes } = useMdm('/x/purposes', undefined, [])
  const { data: questions } = useMdm('/x/questions', undefined, [])
  const [tick, setTick] = useState(0)
  const { data: recent } = useMdm('/x/ledger', { kind: 'VERIFY', limit: 8 }, [tick])
  const [requester, setRequester] = useState('education')
  const [purpose, setPurpose] = useState('SCHOLARSHIP_ELIGIBILITY')
  const [question, setQuestion] = useState('INCOME_AT_MOST')
  const [value, setValue] = useState('200000')
  const [person, setPerson] = useState(null)
  const [tokenText, setTokenText] = useState('')
  const [by, setBy] = useState('person')
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState(null)

  const depts = [...new Map((purposes || []).map((p) => [p.system, p.system_name])).entries()]
  const forDept = (purposes || []).filter((p) => p.system === requester)
  const q = (questions || []).find((x) => x.code === question)
  const paramKey = q?.param

  const pick = async (p) => {
    setPerson(p); setRes(null); setInfo(null)
    try { const x = await mdm(`/x/persons/${p.id}/exchange`); setInfo(x.identity) } catch { setInfo(null) }
  }
  const ask = async () => {
    setBusy(true); setErr(null); setRes(null)
    try {
      const params = paramKey ? { [paramKey]: paramKey === 'category' ? value : Number(value) } : {}
      setRes(await mdm('/x/verify', { method: 'POST', body: { requester, purpose, question, params, ...(by === 'token' ? { reference_token: tokenText.trim() } : { person_id: person?.id }) } }))
      setTick((n) => n + 1)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const ready = by === 'token' ? tokenText.trim() : person
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Verification queries</h1>
      <p className="mdm-intro">A department asks a yes/no or banded question about a person, for a stated purpose. The answer is an outcome with its validity, never the underlying record. The person's consent for that purpose is checked first, and every question is logged.</p>
      <div className="dx-split">
        <section className="mdm-card">
          <h3>Ask a question</h3>
          <div className="mdm-filters">
            <label className="mdm-field"><span>Requesting department</span>
              <select value={requester} onChange={(e) => { setRequester(e.target.value); const f = (purposes || []).find((p) => p.system === e.target.value); if (f) setPurpose(f.code); setRes(null) }}>
                {depts.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label className="mdm-field"><span>Purpose</span>
              <select value={purpose} onChange={(e) => { setPurpose(e.target.value); setRes(null) }}>
                {forDept.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
            <label className="mdm-field"><span>Question</span>
              <select value={question} onChange={(e) => { setQuestion(e.target.value); setRes(null) }}>
                {(questions || []).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>
            {paramKey && <label className="mdm-field"><span>{PARAM[paramKey]?.[0]}</span><input value={value} onChange={(e) => setValue(e.target.value)} /></label>}
          </div>
          <h4>About whom</h4>
          <div className="mdm-filters" role="radiogroup" aria-label="How to identify the person">
            <label className="mdm-check"><input type="radio" checked={by === 'person'} onChange={() => setBy('person')} /> Pick a person</label>
            <label className="mdm-check"><input type="radio" checked={by === 'token'} onChange={() => setBy('token')} /> Use an identity reference token</label>
          </div>
          {by === 'person' ? (
            <>
              <PersonPicker onPick={pick} />
              {person && (
                <p className="mdm-note"><strong>{person.name}</strong> <span className="mdm-sub">{person.mdm_id}</span>
                  {info?.linked ? <> · identity reference <code>{info.tokens[0].token}</code></> : ' · no identity reference linked'}</p>
              )}
            </>
          ) : (
            <label className="mdm-field"><span>Identity reference token</span><input value={tokenText} onChange={(e) => setTokenText(e.target.value)} placeholder="IDR-…" /></label>
          )}
          <div className="mdm-actions">
            <button type="button" className="btn-primary" disabled={busy || !ready} onClick={ask}>Ask</button>
            {err && <span className="mdm-error" role="alert">{err}</span>}
          </div>
        </section>
        <div className="mdm-stack">
          {res && <Explain r={res} />}
          {res?.outcome === 'DENIED_NO_CONSENT' && person && (
            <section className="mdm-card">
              <p className="mdm-note">Nothing was looked up. To continue, the person must consent to this purpose.</p>
              <button type="button" className="btn-secondary" onClick={() => nav(`/dx/consent?person=${person.id}&purpose=${purpose}`)}>Record their consent</button>
            </section>
          )}
        </div>
      </div>
      <section className="mdm-card flush" style={{ marginTop: '1rem' }}>
        <div className="mdm-card-pad"><h3>Recent questions</h3></div>
        <Status loading={false} error={null} />
        <div className="mdm-table-wrap">
          <table className="mdm-table">
            <thead><tr><th>When</th><th>Department</th><th>Question</th><th>About</th><th>Outcome</th></tr></thead>
            <tbody>
              {(recent?.items || []).map((r) => (
                <tr key={r.id}><td className="mdm-sub">{fmtTime(r.ts)}</td><td>{r.requester}</td><td>{(questions || []).find((x) => x.code === r.question)?.label || r.question}</td>
                  <td>{r.person_name || '—'}</td><td><Tag map={OUTCOME} value={r.outcome} /></td></tr>
              ))}
              {recent && !recent.items.length && <tr><td colSpan={5} className="mdm-empty">No questions asked yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

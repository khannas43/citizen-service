import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm } from '../mdm/shared'
import { Tag, OUTCOME, PersonPicker, fmtTime } from './dxShared'
import { PageHeader, Card, DataTable, Banner, Facts, Segmented } from './dxKit'
import { tr } from '../../i18n/lang'

const PARAM = { limit: ['Income limit (rupees a year)', '200000'], category: ['Category', 'OBC'], years: ['Age in years', '18'] }

export function Explain({ r }) {
  const tone = { ANSWERED: 'ok', CONFLICT: 'bad', NO_RECORD: 'info', EXPIRED_SOURCE: 'warn', DENIED_NO_CONSENT: 'warn', DENIED_POLICY: 'warn' }[r.outcome] ?? 'info'
  return (
    <Card title={tr('Result')} tone={tone} actions={<Tag map={OUTCOME} value={r.outcome} />} className="dx-result-card">
      <div aria-live="polite">
        {r.outcome === 'ANSWERED' && (
          <>
            <p className="dx-big">{String(r.answer).replace(/_/g, ' ')}</p>
            <Facts items={[['Income band', r.band], ['Valid until', r.valid_until], ['Source', r.source], ['Identity basis', r.identity_basis]]} />
          </>
        )}
        {r.message && <p className="mdm-note">{r.message}</p>}
        <p className="mdm-sub">{tr('Only the outcome is returned. No amount, certificate or document leaves the department. This exchange is recorded as ledger entry {ledger_id}{v}, using policy versions', { ledger_id: r.ledger_id, v: r.consent_id ? `, under consent ${r.consent_id}` : '' })} {Object.entries(r.policy_versions || {}).filter(([, v]) => v > 1).map(([k, v]) => `${k} v${v}`).join(', ') || 'all at version 1'}.</p>
      </div>
    </Card>
  )
}

/** Ask a department-style question about a person. The platform answers with an outcome and never hands over the record. */
export default function DxVerify() {
  const nav = useNavigate()
  const { data: purposes } = useMdm('/x/purposes', undefined, [])
  const { data: questions } = useMdm('/x/questions', undefined, [])
  const [tick, setTick] = useState(0)
  const { data: recent } = useMdm('/x/ledger', { kind: 'VERIFY', limit: 25 }, [tick])
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
      <PageHeader icon="🔎" title={tr('Verification queries')}
        subtitle={tr('A department asks a yes/no or banded question about a person, for a stated purpose. The answer is an outcome with its validity, never the underlying record. The person\'s consent for that purpose is checked first, and every question is logged.')} />
      <div className="dxk-split">
        <Card title={tr('Ask a question')}>
          <div className="dxk-stackform">
            <div className="dxk-form">
              <label className="dxk-field"><span>{tr('Requesting department')}</span>
                <select value={requester} onChange={(e) => { setRequester(e.target.value); const f = (purposes || []).find((p) => p.system === e.target.value); if (f) setPurpose(f.code); setRes(null) }}>
                  {depts.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label className="dxk-field"><span>{tr('Purpose')}</span>
                <select value={purpose} onChange={(e) => { setPurpose(e.target.value); setRes(null) }}>
                  {forDept.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
              <label className="dxk-field"><span>{tr('Question')}</span>
                <select value={question} onChange={(e) => { setQuestion(e.target.value); setRes(null) }}>
                  {(questions || []).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>
              {paramKey && <label className="dxk-field"><span>{PARAM[paramKey]?.[0]}</span><input value={value} onChange={(e) => setValue(e.target.value)} /></label>}
            </div>
            <hr className="dxk-rule" />
            <div className="dxk-field"><span>{tr('About whom')}</span>
              <div role="radiogroup" aria-label={tr('How to identify the person')} className="dxk-checks">
                <label className="dxk-check"><input type="radio" checked={by === 'person'} onChange={() => setBy('person')} /> {tr('Pick a person')}</label>
                <label className="dxk-check"><input type="radio" checked={by === 'token'} onChange={() => setBy('token')} /> {tr('Use an identity reference token')}</label>
              </div></div>
            {by === 'person' ? (
              <>
                <PersonPicker onPick={pick} />
                {person && (
                  <Banner><strong>{person.name}</strong> <span className="mdm-sub">{person.mdm_id}</span>
                    {info?.linked ? <> {tr('· identity reference')} <code>{info.tokens[0].token}</code></> : ' · no identity reference linked'}</Banner>
                )}
              </>
            ) : (
              <label className="dxk-field"><span>{tr('Identity reference token')}</span><input value={tokenText} onChange={(e) => setTokenText(e.target.value)} placeholder={tr('IDR-…')} /></label>
            )}
            <div className="dxk-actions">
              <button type="button" className="btn-primary" disabled={busy || !ready} onClick={ask}>{tr('Ask')}</button>
              {err && <span className="mdm-error" role="alert">{err}</span>}
            </div>
          </div>
        </Card>
        <div className="mdm-stack">
          {!res && <Card><div className="dxk-empty"><span className="dxk-empty-icon" aria-hidden="true">🔎</span><strong>{tr('No answer yet')}</strong><span>{tr('Fill in the question and press Ask. Only the outcome comes back.')}</span></div></Card>}
          {res && <Explain r={res} />}
          {res?.outcome === 'DENIED_NO_CONSENT' && person && (
            <Banner tone="warn">{tr('Nothing was looked up. To continue, the person must consent to this purpose.')}{' '}
              <button type="button" className="btn-secondary small" onClick={() => nav(`/dx/consent?person=${person.id}&purpose=${purpose}`)}>{tr('Record their consent')}</button></Banner>
          )}
        </div>
      </div>
      <Card title={tr('Recent questions')} flush>
        <DataTable rows={recent?.items || []} pageSize={8} pageSizes={[8, 25]} empty={tr('No questions asked yet')}
          search={{ placeholder: 'Search recent questions', text: (r) => `${r.requester} ${r.person_name || ''} ${r.question} ${r.outcome}` }}
          columns={[
            { key: 'ts', label: 'When', sort: true, render: (r) => <span className="dxk-muted">{fmtTime(r.ts)}</span> },
            { key: 'requester', label: 'Department', sort: true },
            { key: 'question', label: 'Question', render: (r) => (questions || []).find((x) => x.code === r.question)?.label || r.question },
            { key: 'person_name', label: 'About', sort: true, render: (r) => r.person_name || '—' },
            { key: 'outcome', label: 'Outcome', render: (r) => <Tag map={OUTCOME} value={r.outcome} /> },
          ]} />
      </Card>
    </div>
  )
}

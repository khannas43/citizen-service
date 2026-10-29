import { useState } from 'react'
import { MDM_API } from '../../mdmApi'
import { Badge } from '../mdm/shared'
import { PageHeader, Card, DataTable, Banner } from './dxKit'

const SAMPLE = { purpose: 'SCHOLARSHIP_ELIGIBILITY', question: 'INCOME_AT_MOST', params: { limit: 250000 }, reference_token: 'TGREF-000123' }

export default function DxApiExplorer() {
  const [key, setKey] = useState('')
  const [body, setBody] = useState(JSON.stringify(SAMPLE, null, 2))
  const [res, setRes] = useState(null)
  const [cat, setCat] = useState(null)
  const call = async (path, method, payload) => {
    setRes(null)
    try {
      const r = await fetch(`${MDM_API}/api/partner${path}`, { method, headers: { 'X-Api-Key': key.trim(), ...(payload ? { 'Content-Type': 'application/json' } : {}) }, body: payload })
      return { status: r.status, body: await r.json().catch(() => null) }
    } catch { return { status: 0, body: { detail: 'The service cannot be reached.' } } }
  }
  const run = async () => { let p; try { p = JSON.stringify(JSON.parse(body)) } catch { setRes({ status: 0, body: { detail: 'The request body is not valid JSON.' } }); return } setRes(await call('/verify', 'POST', p)) }
  const list = async () => { const r = await call('/catalogue', 'GET'); r.status === 200 ? setCat(r.body) : setRes(r) }
  const curl = `curl -X POST ${MDM_API.startsWith('http') ? MDM_API : 'http://localhost:31173' + MDM_API}/api/partner/verify \\\n  -H "X-Api-Key: ${key || '<your key>'}" -H "Content-Type: application/json" \\\n  -d '${body.replace(/\s+/g, ' ')}'`
  return (
    <div className="mdm-hub">
      <PageHeader icon="🧪" title="API explorer" subtitle="What a department's own system can call, and a place to try it with a key issued on the Security and keys screen. The key decides which department is asking and under which uses." />
      <Card title="Available calls" flush>
        <DataTable rows={[
          { id: 'g', method: 'GET', path: '/api/partner/catalogue', what: 'Lists the uses and questions this key may ask.' },
          { id: 'p', method: 'POST', path: '/api/partner/verify', what: 'Asks one verification-only question about one person, by identity reference token. Returns an outcome, never a document.' },
        ]} dense
          columns={[
            { key: 'method', label: 'Call', render: (r) => <Badge tone="info">{r.method}</Badge> },
            { key: 'path', label: 'Path', render: (r) => <span className="dx-mono">{r.path}</span> },
            { key: 'what', label: 'What it does' },
          ]} />
      </Card>
      <div className="dxk-split">
        <Card title="Try it">
          <div className="dxk-stackform">
            <label className="dxk-field"><span>API key</span><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="k1a2b3c4.xxxxxxxx" autoComplete="off" /></label>
            <label className="dxk-field"><span>Request body</span><textarea rows={8} className="dx-mono" value={body} onChange={(e) => setBody(e.target.value)} /></label>
            <div className="dxk-actions">
              <button type="button" className="btn-primary" disabled={!key.trim()} onClick={run}>Send the question</button>
              <button type="button" className="btn-secondary" disabled={!key.trim()} onClick={list}>What may this key ask?</button>
            </div>
          </div>
        </Card>
        <Card title="Response">
          {!res && !cat && <p className="mdm-note">Send a question to see the response here.</p>}
          {cat && <div><h3 className="dxk-h3">{cat.department}</h3>{cat.uses.map((u) => <p key={u.purpose}><strong>{u.name}</strong> <span className="mdm-sub">{u.consent_required ? 'consent required' : 'statutory'}</span><br /><span className="mdm-sub">{u.questions.map((q) => q.question).join(', ')}</span></p>)}</div>}
          {res && (
            <div aria-label="Response">
              <Banner tone={res.status === 200 ? 'ok' : 'warn'}><strong>HTTP {res.status || 'error'}</strong></Banner>
              <pre className="dxk-pre">{JSON.stringify(res.body, null, 2)}</pre>
            </div>
          )}
        </Card>
      </div>
      <Card title="The same call from a terminal"><pre className="dxk-pre">{curl}</pre></Card>
    </div>
  )
}

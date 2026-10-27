import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status } from '../mdm/shared'

function Tester() {
  const [kind, setKind] = useState('address')
  const [a, setA] = useState('H.No 4-12, Gandhi Ngr Col.')
  const [b, setB] = useState('4 Gandhi Nagar Colony')
  const [r, setR] = useState(null)
  const [err, setErr] = useState(null)
  const go = async () => {
    setErr(null); setR(null)
    try { setR(await mdm('/x/standards/test', { method: 'POST', body: { kind, text: a, other: b.trim() || null } })) } catch (e) { setErr(e.message) }
  }
  return (
    <section className="mdm-card">
      <h3>Try it</h3>
      <div className="mdm-filters">
        <label className="mdm-field"><span>What</span><select value={kind} onChange={(e) => { setKind(e.target.value); setR(null) }}><option value="address">Address</option><option value="name">Name</option></select></label>
        <label className="mdm-field grow"><span>First</span><input value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label className="mdm-field grow"><span>Compare with (optional)</span><input value={b} onChange={(e) => setB(e.target.value)} /></label>
        <button type="button" className="btn-primary small" onClick={go}>Normalise</button>
      </div>
      {err && <p className="mdm-error" role="alert">{err}</p>}
      {r && (
        <dl className="dx-kv" aria-label="Normalisation result">
          {r.kind === 'address' ? <><dt>House number</dt><dd>{r.house_number || '—'}</dd><dt>Cleaned text</dt><dd>{r.normalised}</dd></>
            : <><dt>Words</dt><dd>{r.words.join(', ')}</dd><dt>Skeleton</dt><dd className="dx-mono">{r.skeletons.join(' ')}</dd><dt>Comparison key</dt><dd className="dx-mono">{r.key}</dd></>}
          {r.compared_with && (r.kind === 'address'
            ? <><dt>Other, cleaned</dt><dd>{r.compared_with.normalised} {r.compared_with.house_number ? `(house ${r.compared_with.house_number})` : ''}</dd><dt>Text similarity</dt><dd>{Math.round(r.compared_with.text_similarity * 100)}%</dd><dt>Verdict</dt><dd><strong>{r.compared_with.verdict}</strong></dd></>
            : <><dt>Other key</dt><dd className="dx-mono">{r.compared_with.key}</dd><dt>Verdict</dt><dd><strong>{r.compared_with.same_key ? 'Same name' : `Different (${Math.round(r.compared_with.similarity * 100)}% alike)`}</strong></dd></>)}
        </dl>
      )}
    </section>
  )
}

export default function DxStandards() {
  const { data, error, loading } = useMdm('/x/standards', undefined, [])
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Data standards</h1>
      <p className="mdm-intro">How values are written and compared, so the same person or place is recognised across departments.</p>
      <Status loading={loading && !data} error={error} />
      {data && (
        <section className="mdm-card flush"><div className="mdm-table-wrap"><table className="mdm-table">
          <thead><tr><th>Item</th><th>Standard</th><th>Example</th></tr></thead>
          <tbody>{data.standards.map((s) => <tr key={s.id}><td><strong>{s.element}</strong></td><td>{s.standard}</td><td className="dx-mono">{s.example}</td></tr>)}</tbody>
        </table></div></section>
      )}
      <Tester />
    </div>
  )
}

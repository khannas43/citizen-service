import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status } from '../mdm/shared'
import { PageHeader, Card, DataTable, Facts, Banner } from './dxKit'

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
  const items = r && (r.kind === 'address'
    ? [['House number', r.house_number || '—'], ['Cleaned text', r.normalised],
      ...(r.compared_with ? [['Other, cleaned', `${r.compared_with.normalised} ${r.compared_with.house_number ? `(house ${r.compared_with.house_number})` : ''}`], ['Text similarity', `${Math.round(r.compared_with.text_similarity * 100)}%`], ['Verdict', <strong key="v">{r.compared_with.verdict}</strong>]] : [])]
    : [['Words', r.words.join(', ')], ['Skeleton', <span key="s" className="dx-mono">{r.skeletons.join(' ')}</span>], ['Comparison key', <span key="k" className="dx-mono">{r.key}</span>],
      ...(r.compared_with ? [['Other key', <span key="o" className="dx-mono">{r.compared_with.key}</span>], ['Verdict', <strong key="v">{r.compared_with.same_key ? 'Same name' : `Different (${Math.round(r.compared_with.similarity * 100)}% alike)`}</strong>]] : [])])
  return (
    <Card title="Try it" hint="Type two spellings and see how they are cleaned and compared.">
      <div className="dxk-stackform">
        <div className="dxk-form">
          <label className="dxk-field"><span>What</span><select value={kind} onChange={(e) => { setKind(e.target.value); setR(null) }}><option value="address">Address</option><option value="name">Name</option></select></label>
          <label className="dxk-field"><span>First</span><input value={a} onChange={(e) => setA(e.target.value)} /></label>
          <label className="dxk-field"><span>Compare with (optional)</span><input value={b} onChange={(e) => setB(e.target.value)} /></label>
        </div>
        <div className="dxk-actions"><button type="button" className="btn-primary" onClick={go}>Normalise</button></div>
        {err && <Banner tone="bad">{err}</Banner>}
        {r && <div aria-label="Normalisation result"><Facts items={items} /></div>}
      </div>
    </Card>
  )
}

export default function DxStandards() {
  const { data, error, loading } = useMdm('/x/standards', undefined, [])
  return (
    <div className="mdm-hub">
      <PageHeader icon="📐" title="Data standards" subtitle="How values are written and compared, so the same person or place is recognised across departments." />
      <Status loading={loading && !data} error={error} />
      {data && (
        <Card title="Standards" flush>
          <DataTable rows={data.standards} pageSize={15} initialSort={{ key: 'element', dir: 'asc' }} search={{ placeholder: 'Search standards', text: (s) => `${s.element} ${s.standard} ${s.example}` }} csv={{ name: 'standards' }}
            columns={[
              { key: 'element', label: 'Item', sort: true, render: (s) => <span className="dxk-main">{s.element}</span> },
              { key: 'standard', label: 'Standard', sort: true },
              { key: 'example', label: 'Example', render: (s) => <span className="dx-mono">{s.example}</span> },
            ]} />
        </Card>
      )}
      <Tester />
    </div>
  )
}

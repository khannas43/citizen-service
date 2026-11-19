import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { PageHeader, Card, DataTable, Banner, EmptyState, Stats } from './dxKit'
import { tr, tObj } from '../../i18n/lang'

const ELS = tObj({ age: 'Age (in tens)', residence: 'District', income_band: 'Income band', category: 'Social category', life_status: 'Death registered', household_benefit: 'Housing application', marital_status: 'Marriage recorded', electricity_link: 'Electricity linked', land_holding: 'Land held' })

export default function DxQuery() {
  const { data: purposes, error, loading } = useMdm('/x/purposes', undefined, [])
  const [purpose, setPurpose] = useState('PENSION_ELIGIBILITY')
  const [els, setEls] = useState(['age'])
  const [f, setF] = useState({ district: '', min_age: '', max_age: '', life_status: '' })
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!purposes) return <div className="mdm-hub"><PageHeader icon="🧮" title={tr('Query builder')} /><Status loading={loading} error={error} /></div>
  const pu = purposes.find((p) => p.code === purpose) || purposes[0]
  const allowed = Object.keys(ELS).filter((e) => pu.elements.includes(e))
  const pick = (code) => { setPurpose(code); const p = purposes.find((x) => x.code === code); setEls(Object.keys(ELS).filter((e) => p.elements.includes(e)).slice(0, 1)); setRes(null) }
  const run = async () => {
    setBusy(true); setErr(null); setRes(null)
    const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''))
    try { setRes(await mdm('/x/query', { method: 'POST', body: { requester: pu.system, purpose, elements: els.filter((e) => allowed.includes(e)), filters } })) } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div className="mdm-hub">
      <PageHeader icon="🧮" title={tr('Query builder')}
        subtitle={tr('A department asks a bounded question about a group of people. The answer holds only an MDM id and the elements the use allows. People who have not agreed are left out and counted, never named. Results disappear after a few minutes.')} />
      <div className="dxk-split">
        <Card title={tr('Build the question')}>
          <div className="dxk-stackform">
            <label className="dxk-field"><span>{tr('Use')}</span>
              <select value={purpose} onChange={(e) => pick(e.target.value)}>{purposes.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.system_name})</option>)}</select></label>
            <Banner tone={pu.consent_required ? 'info' : 'warn'}>{pu.consent_required ? 'Consent required: only people who agreed to every element asked for are included.' : 'Statutory use: consent is not needed.'}</Banner>
            <div className="dxk-field" role="group" aria-label={tr('Elements to return')}><span>{tr('Return')}</span>
              <div className="dxk-checks">{allowed.map((e) => <label className="dxk-check" key={e}><input type="checkbox" checked={els.includes(e)} onChange={() => setEls((c) => (c.includes(e) ? c.filter((x) => x !== e) : [...c, e]))} /> {ELS[e]}</label>)}</div></div>
            <div className="dxk-form">
              <label className="dxk-field"><span>{tr('District')}</span><input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} /></label>
              <label className="dxk-field"><span>{tr('Death record')}</span><select value={f.life_status} onChange={(e) => setF({ ...f, life_status: e.target.value })}><option value="">{tr('Any')}</option><option value="DECEASED">{tr('Death registered')}</option><option value="NO_DEATH_RECORD">{tr('No death record')}</option></select></label>
              <label className="dxk-field"><span>{tr('Youngest age')}</span><input inputMode="numeric" value={f.min_age} onChange={(e) => setF({ ...f, min_age: e.target.value.replace(/\D/g, '') })} /></label>
              <label className="dxk-field"><span>{tr('Oldest age')}</span><input inputMode="numeric" value={f.max_age} onChange={(e) => setF({ ...f, max_age: e.target.value.replace(/\D/g, '') })} /></label>
            </div>
            <div className="dxk-actions"><button type="button" className="btn-primary" disabled={busy || !els.length} onClick={run}>{tr('Run the query')}</button>
              <button type="button" className="dxk-link" onClick={() => { setF({ district: '', min_age: '', max_age: '', life_status: '' }); setRes(null) }}>{tr('Reset filters')}</button></div>
            {err && <Banner tone="bad">{err}</Banner>}
          </div>
        </Card>
        <div aria-label={tr('Query result')}>
          {!res && <Card><EmptyState icon="🧮" title={tr('No result yet')} hint={tr('Choose a use, what to return and who to include, then run the query.')} /></Card>}
          {res && res.outcome === 'ANSWERED' && (
            <>
              <Stats items={[
                { label: res.shared === 1 ? 'Person included' : 'People included', value: res.shared, tone: 'ok', hint: `expires ${fmtTime(res.expires_at)}` },
                { label: 'Matched the filters', value: res.matched },
                { label: 'Left out: not agreed', value: res.withheld_no_consent || 0, tone: res.withheld_no_consent ? 'warn' : undefined },
              ]} />
              {res.message && <Banner tone="warn">{res.message}</Banner>}
              {res.rows.length > 0 && (
                <Card title={tr('Result')} flush hint={res.truncated ? 'Showing the first 200.' : undefined}>
                  <DataTable rows={res.rows} rowKey="mdm_id" pageSize={10} pageSizes={[10, 25, 50]} dense csv={{ name: 'query-result' }}
                    search={{ placeholder: 'Search the result', text: (r) => `${r.mdm_id} ${res.elements.map((e) => r[e]).join(' ')}` }}
                    columns={[{ key: 'mdm_id', label: 'MDM id', sort: true, render: (r) => <span className="dx-mono">{r.mdm_id}</span> },
                      ...res.elements.map((e) => ({ key: e, label: ELS[e], sort: true }))]} />
                </Card>
              )}
              <p className="mdm-sub">{tr('Written to the clearing house as exchange {ledger_id}.', { ledger_id: res.ledger_id })} <Badge tone="info">{tr('temporary')}</Badge></p>
            </>
          )}
          {res && res.outcome !== 'ANSWERED' && <Banner tone="warn">{res.message}</Banner>}
        </div>
      </div>
    </div>
  )
}

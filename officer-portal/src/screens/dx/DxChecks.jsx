import { useNavigate, useSearchParams } from 'react-router-dom'
import './dxKit.css'
import '../mdm/mdm.css'
import { PageHeader, Tabs } from './dxKit'
import { Turning18, Households } from '../mdm/Worklists'
import { tr } from '../../i18n/lang'

/** Two live worklists over the master data: people about to turn 18 (what they would need to claim an entitlement) and households with overlapping applications or cards. */
export default function DxChecks() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab = raw === 'households' ? 'households' : 'turning18'
  const setTab = (id) => {
    const next = new URLSearchParams(params)
    next.set('tab', id)
    setParams(next, { replace: true })
  }
  const nav = useNavigate()
  const openPerson = (id) => nav(`/mdm?tab=people&person=${id}`)
  return (
    <div className="mdm-hub">
      <PageHeader icon="🧮" title={tr('Eligibility checks')} subtitle={tr('Worklists drawn from master data: who is about to need adult entitlements, and which households overlap.')} />
      <Tabs label={tr('Eligibility checks')} value={tab} onChange={setTab} tabs={[{ id: 'turning18', label: 'Turning 18' }, { id: 'households', label: 'Households' }]} />
      <div role="tabpanel" className="mdm-panel">
        {tab === 'turning18' ? <Turning18 openPerson={openPerson} /> : <Households openPerson={openPerson} />}
      </div>
    </div>
  )
}

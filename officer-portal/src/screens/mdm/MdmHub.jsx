import { useSearchParams } from 'react-router-dom'
import Overview from './Overview'
import Persons from './Persons'
import Person360 from './Person360'
import ReviewQueue from './ReviewQueue'
import DataQuality from './DataQuality'
import RulesAudit from './RulesAudit'
import UseCases from './UseCases'
import '../dx/dxKit.css'
import './mdm.css'
import { PageHeader, Tabs } from '../dx/dxKit'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'usecases', label: 'Use cases' },
  { id: 'people', label: 'People' },
  { id: 'review', label: 'Review queue' },
  { id: 'quality', label: 'Data quality' },
  { id: 'rules', label: 'Rules & audit' },
]

/** Master Data Management: one place to see each person across departments and settle doubtful matches. */
export default function MdmHub() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview'
  const person = params.get('person')
  const go = (next, extra = {}) => setParams({ tab: next, ...extra })
  const openPerson = (id) => setParams({ tab: 'people', person: String(id) })

  return (
    <div className="mdm-hub">
      <PageHeader icon="🧬" title="Master Data" subtitle="One view of each person across departments. Departments stay the source of truth." />
      <Tabs label="Master data" value={tab} onChange={(id) => go(id)} tabs={TABS} />
      <div role="tabpanel" className="mdm-panel">
        {tab === 'overview' && <Overview goto={go} />}
        {tab === 'usecases' && <UseCases goto={go} openPerson={openPerson} />}
        {tab === 'people' && (person ? <Person360 key={person} id={person} back={() => go('people')} openPerson={openPerson} /> : <Persons openPerson={openPerson} />)}
        {tab === 'review' && <ReviewQueue key={params.get('source') || 'all'} initialSource={params.get('source') || ''} />}
        {tab === 'quality' && <DataQuality key={`${params.get('code')}${params.get('source')}`} initial={{ code: params.get('code') || '', source: params.get('source') || '' }} openPerson={openPerson} />}
        {tab === 'rules' && <RulesAudit />}
      </div>
    </div>
  )
}

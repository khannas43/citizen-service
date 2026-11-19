import { useSearchParams, Navigate } from 'react-router-dom'
import Overview from './Overview'
import Persons from './Persons'
import Person360 from './Person360'
import ReviewQueue from './ReviewQueue'
import DataQuality from './DataQuality'
import RulesAudit from './RulesAudit'
import '../dx/dxKit.css'
import './mdm.css'
import { PageHeader, Tabs } from '../dx/dxKit'
import { tr } from '../../i18n/lang'

const TABS = [
  { id: 'people', label: 'People' },
  { id: 'review', label: 'Review queue' },
  { id: 'quality', label: 'Data quality' },
  { id: 'rules', label: 'Rules & audit' },
]

/** Data quality: the at-a-glance picture first, then the list of individual issues. */
function QualityTab({ params, go, openPerson }) {
  const hasFilter = !!(params.get('code') || params.get('source'))
  const view = params.get('view') || (hasFilter ? 'issues' : 'glance')
  return (
    <div className="mdm-stack">
      <Tabs label={tr('Data quality')} value={view} onChange={(v) => go('quality', { view: v })} tabs={[{ id: 'glance', label: 'At a glance' }, { id: 'issues', label: 'Issues' }]} />
      {view === 'glance'
        ? <Overview goto={go} />
        : <DataQuality key={`${params.get('code')}${params.get('source')}`} initial={{ code: params.get('code') || '', source: params.get('source') || '' }} openPerson={openPerson} />}
    </div>
  )
}

/** Master Data Management: one place to see each person across departments and settle doubtful matches. */
export default function MdmHub() {
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  // earlier addresses keep working: the use-case views moved to Eligibility checks and the overview into Data quality
  if (asked === 'usecases') return <Navigate to="/dx/checks" replace />
  if (asked === 'overview') return <Navigate to="/mdm?tab=quality" replace />
  const tab = TABS.some((t) => t.id === asked) ? asked : 'people'
  const person = params.get('person')
  const go = (next, extra = {}) => setParams({ tab: next, ...extra })
  const openPerson = (id) => setParams({ tab: 'people', person: String(id) })

  return (
    <div className="mdm-hub">
      <PageHeader icon="🧬" title={tr('Master Data')} subtitle={tr('One view of each person across departments. Departments stay the source of truth.')} />
      <Tabs label={tr('Master data')} value={tab} onChange={(id) => go(id)} tabs={TABS} />
      <div role="tabpanel" className="mdm-panel">
        {tab === 'people' && (person ? <Person360 key={person} id={person} back={() => go('people')} openPerson={openPerson} /> : <Persons openPerson={openPerson} />)}
        {tab === 'review' && <ReviewQueue key={`${params.get('source') || 'all'}|${params.get('q') || ''}|${params.get('from') || ''}`} initialSource={params.get('source') || ''} initialQuery={params.get('q') || ''} autoOpen={params.get('open') === '1'} fromPerson={params.get('from') || ''} openPerson={openPerson} />}
        {tab === 'quality' && <QualityTab params={params} go={go} openPerson={openPerson} />}
        {tab === 'rules' && <RulesAudit />}
      </div>
    </div>
  )
}

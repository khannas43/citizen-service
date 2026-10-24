import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import ImportData from './ImportData'
import DataReadiness from './DataReadiness'
import './DataHub.css'

const TABS = [
  { id: 'import', label: 'Load data' },
  { id: 'readiness', label: 'Data readiness' },
]

/** One place for data work: load the CSV feeds, and see how complete each feed is. */
export default function DataHub() {
  const [params, setParams] = useSearchParams()
  const { hash } = useLocation()
  const tab = params.get('tab') === 'readiness' ? 'readiness' : 'import'

  // a link such as /data?tab=import#import-settlements lands on that load card once the tab is showing
  useEffect(() => {
    if (tab !== 'import' || !hash) return undefined
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 150)
    return () => clearTimeout(t)
  }, [tab, hash])

  return (
    <div className="data-hub">
      <nav className="dh-tabs" role="tablist" aria-label="Data">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`dh-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="dh-panel"
            className={tab === t.id ? 'active' : ''}
            onClick={() => setParams({ tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div id="dh-panel" role="tabpanel" aria-labelledby={`dh-tab-${tab}`}>
        {tab === 'import' ? <ImportData /> : <DataReadiness />}
      </div>
    </div>
  )
}

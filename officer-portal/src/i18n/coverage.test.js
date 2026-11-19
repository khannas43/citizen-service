import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import te from './te'

// Every plain-text tr('...') in the screens covered so far must have Telugu, so a new English string cannot slip in unnoticed.
const ROOT = path.resolve(__dirname, '..')
const FILES = [
  ...fs.readdirSync(path.join(ROOT, 'screens/mdm')).filter((f) => /\.(jsx|js)$/.test(f) && !/test/.test(f)).map((f) => `screens/mdm/${f}`),
  'App.jsx',
  'screens/dx/dxKit.jsx', 'screens/dx/dxShared.jsx', 'screens/dx/DxChecks.jsx',
  'screens/dx/DxApprovals.jsx', 'screens/dx/DxConsent.jsx', 'screens/dx/DxNotices.jsx', 'screens/dx/NoticeKit.jsx', 'screens/dx/BulkAnswer.jsx', 'screens/dx/ExchangePanel.jsx', 'screens/dx/DxEvents.jsx', 'screens/dx/DxControl.jsx', 'screens/dx/DxFlowBoard.jsx', 'screens/dx/DxDaily.jsx', 'screens/dx/DxHousing.jsx', 'screens/dx/DxWork.jsx', 'i18n/mt.jsx', 'screens/dx/DxDemo.jsx', 'screens/dx/DxLineage.jsx', 'screens/dx/DxStory.jsx', 'screens/dx/DxTour.jsx', 'screens/dx/DxQuery.jsx', 'screens/dx/DxStandards.jsx', 'screens/dx/DxCatalogue.jsx', 'screens/dx/DxConnectors.jsx', 'screens/dx/DxAccess.jsx', 'screens/dx/DxApiExplorer.jsx', 'screens/dx/DxVerify.jsx', 'screens/dx/DxCitizen.jsx', 'screens/dx/citizenShared.jsx', 'screens/dx/PersonLineage.jsx', 'screens/dx/FlowGraph.jsx', 'screens/dx/NodeDetail.jsx', 'screens/dx/DxPolicy.jsx', 'screens/dx/DxRetention.jsx', 'screens/dx/DxLedger.jsx', 'screens/dx/DxAudit.jsx', 'screens/dx/DxDiscrepancies.jsx', 'screens/dx/FeedQualityContacts.jsx', 'screens/dx/FeedQualityRules.jsx', 'screens/dx/FeedQualityRange.jsx', 'screens/dx/DxQuality.jsx', 'screens/dx/QualityCharts.jsx', 'screens/dx/QualityReasons.jsx', 'screens/dx/DxResponseTimes.jsx', 'screens/dx/DxKeys.jsx', 'screens/dx/DxAssisted.jsx', 'screens/dx/PartyKit.jsx', 'screens/dx/PersonFinder.jsx',
]

describe('Telugu coverage of the translated screens', () => {
  it('has a Telugu line for every tr() text', () => {
    const missing = []
    FILES.forEach((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      for (const m of src.matchAll(/\btr\('((?:[^'\\]|\\.)*)'/g)) {
        const key = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
        if (!te[key]) missing.push(`${f}: ${key}`)
      }
    })
    expect(FILES.length).toBeGreaterThan(10)
    expect(missing).toEqual([])
  })
})

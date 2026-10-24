import {
  fetchGeographicDistricts,
  fetchGeographicTalukas,
  fetchGeographicVillages,
} from '../api'

const EXPORT_PAGE = 100

async function fetchAllPages(fetchPage) {
  const rows = []
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const data = await fetchPage(offset, EXPORT_PAGE)
    const batch = data.results ?? []
    rows.push(...batch)
    total = data.totalMatched ?? rows.length
    if (batch.length === 0) break
    offset += EXPORT_PAGE
  }
  return rows
}

export async function collectSchemeExportData(schemeId, onProgress) {
  onProgress?.('Loading districts…')
  const districts = await fetchAllPages((offset, limit) =>
    fetchGeographicDistricts(schemeId, { sortBy: 'name', sortDir: 'asc', offset, limit }),
  )

  const geoRows = []
  for (let i = 0; i < districts.length; i++) {
    const district = districts[i]
    onProgress?.(`Loading geographic data (${i + 1} of ${districts.length} districts)…`)
    const talukas = await fetchAllPages((offset, limit) =>
      fetchGeographicTalukas(schemeId, district.name, { sortBy: 'name', sortDir: 'asc', offset, limit }),
    )

    if (talukas.length === 0) {
      geoRows.push({
        state: 'Gujarat',
        district: district.name,
        taluka: '',
        village: '',
        beneficiaries: district.beneficiaryCount,
      })
      continue
    }

    for (const taluka of talukas) {
      const villages = await fetchAllPages((offset, limit) =>
        fetchGeographicVillages(schemeId, district.name, taluka.name, {
          sortBy: 'name',
          sortDir: 'asc',
          offset,
          limit,
        }),
      )

      if (villages.length === 0) {
        geoRows.push({
          state: 'Gujarat',
          district: district.name,
          taluka: taluka.name,
          village: '',
          beneficiaries: taluka.beneficiaryCount,
        })
        continue
      }

      for (const village of villages) {
        geoRows.push({
          state: 'Gujarat',
          district: district.name,
          taluka: taluka.name,
          village: village.name,
          beneficiaries: village.beneficiaryCount,
        })
      }
    }
  }

  return geoRows
}

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function schemeSummaryLines(scheme, statusCounts) {
  const lines = [
    ['Field', 'Value'],
    ['Scheme Name', scheme.name ?? ''],
    ['Department', scheme.department ?? ''],
    ['Category', scheme.category ?? ''],
    ['Benefit Type', scheme.benefitType ?? ''],
    ['Benefit Value', scheme.benefitValue ?? ''],
    ['Income Ceiling', scheme.incomeCeiling ?? ''],
    ['Eligible Castes', scheme.eligibleCastes ?? ''],
    ['Valid From', scheme.validFrom ?? ''],
    ['Valid To', scheme.validTo ?? ''],
    ['', ''],
    ['Pipeline Stage', 'Count'],
    ['Identified', statusCounts?.identified ?? 0],
    ['Confirmed', statusCounts?.confirmed ?? 0],
    ['Active', statusCounts?.active ?? 0],
    ['Removed', statusCounts?.removed ?? 0],
    ['Total', statusCounts?.total ?? 0],
    ['Disbursable', statusCounts?.disbursable ?? 0],
    ['', ''],
  ]
  return lines
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadSchemeExcel(scheme, statusCounts, geoRows) {
  const summary = schemeSummaryLines(scheme, statusCounts)
  const geoHeader = ['State', 'District', 'Taluka', 'Village/City', 'Beneficiaries']
  const geoLines = geoRows.map((r) => [
    r.state,
    r.district,
    r.taluka,
    r.village,
    r.beneficiaries,
  ])

  const allLines = [
    ...summary,
    geoHeader,
    ...geoLines,
  ]

  const csv = '\uFEFF' + allLines.map((row) => row.map(csvEscape).join(',')).join('\n')
  const safeName = (scheme.name ?? 'scheme').replace(/[^\w.-]+/g, '_').slice(0, 60)
  downloadBlob(`${safeName}_scheme_data.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }))
}

export function downloadSchemePdf(scheme, statusCounts, geoRows) {
  const safeName = (scheme.name ?? 'Scheme').replace(/</g, '')
  const generated = new Date().toLocaleString()
  const summaryRows = [
    ['Department', scheme.department ?? '—'],
    ['Category', scheme.category ?? '—'],
    ['Benefit', `${scheme.benefitType ?? '—'}: ${scheme.benefitValue ?? '—'}`],
    ['Income ceiling', scheme.incomeCeiling != null ? `₹${Number(scheme.incomeCeiling).toLocaleString()}` : '—'],
    ['Valid period', `${scheme.validFrom ?? '—'} → ${scheme.validTo ?? '—'}`],
  ]

  const pipelineRows = [
    ['Identified', statusCounts?.identified ?? 0],
    ['Confirmed', statusCounts?.confirmed ?? 0],
    ['Active', statusCounts?.active ?? 0],
    ['Removed', statusCounts?.removed ?? 0],
    ['Total', statusCounts?.total ?? 0],
  ]

  const geoTableRows = geoRows
    .map(
      (r) =>
        `<tr><td>${r.state}</td><td>${r.district}</td><td>${r.taluka || '—'}</td><td>${r.village || '—'}</td><td style="text-align:center">${Number(r.beneficiaries).toLocaleString()}</td></tr>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${safeName} — Scheme Data</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #1e293b; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #64748b; margin-bottom: 20px; }
  h2 { font-size: 13px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  .summary td:first-child { font-weight: 600; width: 140px; background: #f8fafc; }
  @media print { body { margin: 12px; } }
</style></head><body>
  <h1>${safeName}</h1>
  <div class="meta">Gujarat Government · Scheme Management · Generated ${generated}</div>
  <h2>Scheme Details</h2>
  <table class="summary">${summaryRows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
  <h2>Beneficiary Pipeline</h2>
  <table class="summary">${pipelineRows.map(([k, v]) => `<tr><td>${k}</td><td>${Number(v).toLocaleString()}</td></tr>`).join('')}</table>
  <h2>Geographic Coverage (${geoRows.length.toLocaleString()} rows)</h2>
  <table>
    <thead><tr><th>State</th><th>District</th><th>Taluka</th><th>Village/City</th><th style="text-align:center">Beneficiaries</th></tr></thead>
    <tbody>${geoTableRows}</tbody>
  </table>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) {
    throw new Error('Pop-up blocked — allow pop-ups to download PDF')
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

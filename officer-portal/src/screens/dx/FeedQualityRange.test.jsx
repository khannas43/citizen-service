import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxQuality from './DxQuality'

afterEach(cleanup)
beforeEach(() => { localStorage.setItem('officer_token', 'tok'); globalThis.URL.createObjectURL = vi.fn(() => 'blob:x'); globalThis.URL.revokeObjectURL = vi.fn() })
const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data, blob: async () => new Blob(['x']), headers: { get: () => 'attachment; filename="feed-quality-summary_a_to_b.csv"' } })
const route = (table) => vi.fn(async (url, init = {}) => {
  const u = String(url)
  for (const [k, v] of Object.entries(table)) if (u.includes(k)) return typeof v === 'function' ? v(u, init) : json(v)
  return json({})
})
const feeds = { crs: { name: 'Civil registration (CRS)', status: 'WARN', records: 100, expectations: 2, passed: 1, critical_failed: 0, advisory_failed: 1 } }
const latest = { run: { id: 9, actor: 'x', trigger: 'MANUAL', gx_version: '1.24.1', finished_at: '2026-10-30T10:00:00Z' }, summary: { feeds, totals: { feeds: 1, pass: 0, warn: 1, fail: 0 } },
  results: [{ id: 2, source: 'crs', rule_key: 'complete:dob', scope: 'record', expectation: 'expect_column_values_to_not_be_null', column_name: 'dob', severity: 'advisory', description: 'At least 90% of records carry date of birth', success: false, element_count: 100, unexpected_count: 12, unexpected_percent: 12, samples: [] }] }
const range = { allowed_percent: 1.5, run: { id: 9, finished_at: '2026-10-30T10:00:00Z', rule_version: 2 }, from: '2026-10-01', to: '2026-10-07', has_daily: true, available: { from: '2026-09-01', to: '2026-10-30' },
  tiles: { records: 70, feeds: 1, rules_failed: 1, rules_checked: 2, failed_checks: 9, checks: 140 },
  days: [{ day: '2026-10-01', records: 30, checks: 60, failed: 6, percent_failed: 10 }, { day: '2026-10-02', records: 40, checks: 80, failed: 3, percent_failed: 3.75 }],
  rules: [{ source: 'crs', feed: 'Civil registration (CRS)', rule_key: 'complete:dob', scope: 'record', severity: 'advisory', description: 'At least 90% of records carry date of birth', checked: 70, failed: 9, passed: 61, percent_failed: 12.86, tolerance: 10, outcome: 'failed', status: 'WARN' },
    { source: 'crs', feed: 'Civil registration (CRS)', rule_key: 'freshness', scope: 'feed', severity: 'advisory', description: 'The latest record is recent', checked: null, failed: null, passed: null, percent_failed: null, tolerance: null, outcome: 'passed', status: 'PASS' }] }
const rules = { active: { version: 2, actor: 'asha', created_at: '2026-10-30T10:00:00Z', reason: 'r', settings: { name_share: 0.99, name_min: 2, name_max: 80, min_birth_year: 1900, max_age: 120, completeness_share: null, freshness_days: null, advisory_off: [] } },
  history: [{ version: 2, actor: 'asha', created_at: '2026-10-30T10:00:00Z', reason: 'Initial' }], advisory_groups: { completeness: 'Fields are filled in', freshness: 'Latest record is recent', repeats: 'Repeated records' } }
const base = { '/x/quality/latest': latest, '/x/quality/runs': { items: [] }, '/x/quality/range': range, '/x/quality/rules': rules }
const wrap = (at = '/') => render(<MemoryRouter initialEntries={[at]}><DxQuality /></MemoryRouter>)

describe('Feed quality: records received', () => {
  const RC = '/?tab=received'
  it('shows counts for the window, feed-level rules as pass or fail, and the charts', async () => {
    globalThis.fetch = route(base)
    wrap(RC)
    expect(await screen.findByText('Records received', { selector: 'h2' })).toBeInTheDocument()
    expect(await screen.findByText('1 of 2', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('12.86% (10%)')).toBeInTheDocument()
    expect(screen.getByText('Judged on the whole feed, not record by record')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Records received each day, 2 days/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Share of record checks failed each day/ })).toBeInTheDocument()
    expect(screen.getByText('Checks that failed most')).toBeInTheDocument()
    expect(screen.getByText(/What the rules allow \(1.5%\)/)).toBeInTheDocument()
    expect(screen.getByText(/Day above what the rules allow/)).toBeInTheDocument()
  })

  it('summarises a feed against the previous period, names silent days, and limits values to 7 days', async () => {
    const fs = [{ source: 'crs', feed: 'Civil registration (CRS)', records: 120, previous_records: 100, change_percent: 20, window_days: 7, active_days: 5, average_per_day: 17.1, busiest_day: { day: '2026-10-03', records: 40 }, silent_days: ['2026-10-05', '2026-10-06'] }]
    globalThis.fetch = route({ ...base, '/x/quality/range': { ...range, feed_summary: fs } })
    wrap('/?tab=received&feed=crs')
    expect(await screen.findByText(/\+20% on the previous 7 days \(100\)/)).toBeInTheDocument()
    expect(screen.getByText('5 of 7')).toBeInTheDocument()
    expect(screen.getByText(/Nothing was received from Civil registration \(CRS\) on:/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Records to chase/ })).toBeDisabled()
  })

  it('asks for the chosen window and downloads the CSV', async () => {
    const f = route({ '/x/quality/range.csv': () => json({}), ...base })
    globalThis.fetch = f
    wrap(RC)
    await screen.findByText(/Based on run 9/)
    fireEvent.click(screen.getByRole('button', { name: /Summary by rule/ }))
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('/x/quality/range.csv') && String(u).includes('kind=summary') && String(u).includes('date_from='))).toBe(true))
    expect(await screen.findByText(/Saved feed-quality-summary/)).toBeInTheDocument()
  })

  it('says how to get counts when the latest run has none by day', async () => {
    globalThis.fetch = route({ ...base, '/x/quality/range': { ...range, has_daily: false, available: null } })
    wrap(RC)
    expect(await screen.findByText(/Counts by day are recorded from the next run/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Summary by rule/ })).toBeDisabled()
  })
})

describe('Feed quality: rule settings', () => {
  it('stays closed until opened, needs a reason, and saves a new version', async () => {
    const f = route({ '/x/quality/rules/preview': () => json({ settings: {}, changes: { max_age: { from: 120, to: 100 } }, feeds: {}, rules_changed: [], feeds_changed: 0 }),
      ...base, '/x/quality/rules': (u, init) => (init.method === 'POST' ? json({ version: 3 }) : json(rules)) })
    globalThis.fetch = f
    wrap('/?tab=settings')
    fireEvent.click(await screen.findByRole('button', { name: /Rule settings/ }))
    const age = await screen.findByLabelText('Highest age')
    const save = screen.getByRole('button', { name: 'Save as new version' })
    expect(save).toBeDisabled()
    fireEvent.change(age, { target: { value: '100' } })
    expect(save).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Preview the effect' }))
    expect(await screen.findByText(/No feed would change status/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/pension scheme/), { target: { value: 'Pension members above 100' } })
    fireEvent.click(save)
    expect(await screen.findByText(/Saved as version 3/)).toBeInTheDocument()
    const post = f.mock.calls.find(([u, i]) => String(u).endsWith('/x/quality/rules') && i?.method === 'POST')
    expect(JSON.parse(post[1].body).settings.max_age).toBe(100)
  })
})

describe('Feed quality: department contacts', () => {
  it('lists a contact per feed, marks placeholders and saves an edit', async () => {
    const items = [{ source: 'crs', feed: 'Civil registration (CRS)', name: 'Data steward', role: 'placeholder', email: 'd@crs.example', phone: null, placeholder: true, updated_at: null }]
    const f = route({ '/x/quality/contacts/crs': () => json({ source: 'crs', name: 'Asha' }), ...base, '/x/quality/contacts': { items } })
    globalThis.fetch = f
    wrap('/?tab=settings')
    fireEvent.click(await screen.findByRole('button', { name: /Department contacts/ }))
    expect(await screen.findByText('Placeholder')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Civil registration (CRS): name'), { target: { value: 'Asha Rao' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Saved the contact for Civil registration/)).toBeInTheDocument()
    const put = f.mock.calls.find(([u, i]) => String(u).includes('/x/quality/contacts/crs') && i?.method === 'PUT')
    expect(JSON.parse(put[1].body).name).toBe('Asha Rao')
  })
})

describe('Feed quality: tabs and failed-check navigation', () => {
  it('opens on the overview, switches tabs, and shows a trend per feed', async () => {
    globalThis.fetch = route({ ...base, '/x/quality/latest': { ...latest, trend: { crs: [90, 93, 95] } } })
    wrap()
    expect(await screen.findByText('Civil registration (CRS)', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Civil registration \(CRS\) pass rate, last 3 runs/ })).toBeInTheDocument()
    expect(screen.getByText('▲ improving')).toBeInTheDocument()
    expect(screen.queryByText('Latest run, check by check')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Checks/ }))
    expect(await screen.findByText('Latest run, check by check')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(await screen.findByRole('button', { name: /Rule settings/ })).toBeInTheDocument()
  })

  it('steps through failed checks and copies a message for the department without personal values', async () => {
    const two = { ...latest, contacts: { crs: { name: 'Asha Rao', role: 'Registrar office', email: 'asha@x.example' } }, results: [
      { ...latest.results[0], id: 1, explain: { why: 'First reason', action: 'First action' }, found: { examples: [{ source_rid: 'K-1', value: '1990-01-01' }], breakdown: [{ label: 'blank', count: 1 }] } },
      { ...latest.results[0], id: 3, description: 'Second check', explain: { why: 'Second reason', action: 'Second action' }, found: { examples: [] } }] }
    globalThis.fetch = route({ ...base, '/x/quality/latest': two })
    const write = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    wrap('/?tab=checks')
    fireEvent.click(await screen.findByText('At least 90% of records carry date of birth'))
    expect(await screen.findByText('Failed check 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous failed check' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Copy message for the department' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const text = write.mock.calls[0][0]
    expect(text).toContain('First reason') && expect(text).toContain('K-1') && expect(text).toContain('Asha Rao')
    expect(text).not.toContain('1990-01-01')
    fireEvent.click(screen.getByRole('button', { name: 'Next failed check' }))
    expect(await screen.findByText('Second reason')).toBeInTheDocument()
    expect(screen.getByText('Failed check 2 of 2')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MdmHub from './MdmHub'
import Person360 from './Person360'

afterEach(cleanup)
beforeEach(() => { localStorage.setItem('officer_token', 'tok') })
const json = (data) => ({ ok: true, status: 200, json: async () => data })
const route = (table, calls) => vi.fn(async (url, init = {}) => {
  const u = String(url); calls?.push(u)
  for (const [k, v] of Object.entries(table)) if (u.includes(k)) return json(typeof v === 'function' ? v(u, init) : v)
  return json({})
})

const task = {
  id: 9, status: 'OPEN', source: 'identity_reference', source_name: 'Identity reference service', source_rid: 'IDR-1', name: 'Praveen Gangaputra', reason: 'two plausible candidates', score: 0.9,
  view: { source_name: 'Identity reference service', name: 'Praveen Gangaputra', gender: 'M', dob: null, birth_year: 2015, address: 'Sangareddy', family: [], spouse: null, mobile: null, ration_card: null },
  candidate_details: [
    { score: 0.9, evidence: {}, person: { id: 1, mdm_id: 'MDM-1', name: 'Praveen Gangaputra', gender: 'M', dob: '2015-11-09', source_count: 2, district: 'Sangareddy', spouses: [] },
      records: [{ source_name: 'Civil registration (CRS)', source_rid: 'CRS-1', name: 'Praveen Gangaputra', dob: '2015-11-09', address: 'Sangareddy', family: ['Praveen Goud'], spouse: null, mobile: null, ration_card: null }] },
    { score: 0.8, evidence: {}, person: { id: 2, mdm_id: 'MDM-2', name: 'Praveen Gangaputra', gender: 'M', birth_year: 2014, source_count: 1, district: 'Medak', spouses: ['Lakshmi'] },
      records: [{ source_name: 'Civil supplies (PDS)', source_rid: 'PDS-2', name: 'Praveen Gangaputra', age: 11, address: '4 Main Rd, Medak', family: [], spouse: null, mobile: '90000 11111', ration_card: 'TG-RC-1' }] },
  ],
}

describe('Review queue', () => {
  it('searches the whole queue on the server, and compares records side by side with their sources', async () => {
    const calls = []
    globalThis.fetch = route({
      '/review/9': task,
      '/review': { total: 1, limit: 20, offset: 0, items: [{ id: 9, name: 'Praveen Gangaputra', source: 'identity_reference', source_name: 'Identity reference service', source_rid: 'IDR-1', score: 0.9, candidate_count: 2, district: 'Sangareddy' }] },
      '/sources': [],
    }, calls)
    render(<MemoryRouter initialEntries={['/mdm?tab=review']}><MdmHub /></MemoryRouter>)
    fireEvent.change(await screen.findByPlaceholderText(/Search the whole queue/), { target: { value: 'IDR-1' } })
    await waitFor(() => expect(calls.some((c) => c.includes('/review?') && c.includes('q=IDR-1'))).toBe(true))
    const reviewBtn = await screen.findByRole('button', { name: 'Review' })
    expect(reviewBtn.className).toMatch(/btn-secondary/)
    fireEvent.click(reviewBtn)
    expect(await screen.findByRole('button', { name: /Record to place/ })).toHaveAttribute('aria-expanded', 'true')    // only this box is open to begin with
    for (const n of [/Side by side/, /Your decision/]) {
      expect(screen.getByRole('button', { name: n })).toHaveAttribute('aria-expanded', 'false')
    }
    expect(screen.getByText(/Best candidate agreement/).querySelector('[role="tooltip"]')).toHaveTextContent('is worked out')
    const back = screen.getByRole('button', { name: '← Back to the queue' })
    expect(back.className).toMatch(/dxk-back/)
    expect(back.closest('.dxk-hero-actions')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Side by side/ }))
    expect(await screen.findByText('Full address')).toBeInTheDocument()
    expect(screen.getAllByText('Spouse').length).toBeGreaterThan(0)
    expect(screen.getByText('Mobile number')).toBeInTheDocument()
    expect(screen.getAllByText('Civil registration (CRS)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Civil supplies (PDS)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('90000 11111').length).toBeGreaterThanOrEqual(1)
    const cmp = document.querySelector('.rv .cmp-table')
    expect(cmp).toBeTruthy()
    expect(cmp.className).toMatch(/cmp-table/)
    expect(getComputedStyle(cmp).tableLayout === 'fixed' || cmp.closest('.rv')).toBeTruthy()
  })
})

describe('Person page', () => {
  it('shows the spouse in the golden record and the household as the household view does', async () => {
    globalThis.fetch = route({
      '/x/persons/5/household': { person: { id: 5 }, cards: ['TG-RC-9'], caveats: [], members: [
        { id: 5, mdm_id: 'MDM-5', name: 'Anil Chakali', relation: 'Head', age: 40, is_selected: true, life_status: 'NO_DEATH_RECORD' },
        { id: 6, mdm_id: 'MDM-6', name: 'Lakshmi Chakali', relation: 'Spouse', age: 36, is_selected: false, life_status: 'NO_DEATH_RECORD' },
        { id: 7, mdm_id: 'MDM-7', name: 'Naresh Chakali', relation: 'Son', age: 12, is_selected: false, life_status: 'NO_DEATH_RECORD' }] },
      '/x/persons/5/exchange': { identity: { linked: false, note: 'none' }, consents: [], exchanges: [] },
      '/persons/5': { person: { id: 5, mdm_id: 'MDM-5', name: 'Anil Chakali', gender: 'M', dob: '1985-07-21', district: 'Nalgonda', source_count: 5, confidence: 0.8, life_status: 'NO_DEATH_RECORD' },
        attributes: [{ attribute: 'name', value: 'Anil Chakali', chosen_source: 'crs', rule: 'r', conflict: false, alternatives: [] }],
        records: [], issues: [], audit: [], missing_sources: [],
        relationships: [{ kind: 'SPOUSE', role_of_other: 'SPOUSE', basis: 'Marriage register', source: 'marriage_register', other: { id: 6, name: 'Lakshmi Chakali', life_status: 'NO_DEATH_RECORD' } },
          { kind: 'PARENT_OF', role_of_other: 'CHILD', basis: 'Ration card', source: 'pds_view', other: { id: 7, name: 'Naresh Chakali', life_status: 'NO_DEATH_RECORD' } }] },
    })
    render(<MemoryRouter><Person360 id={5} back={() => {}} openPerson={() => {}} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /The golden record/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Family and household/ }))
    expect(await screen.findByText('Relation to the head')).toBeInTheDocument()
    expect(screen.getByText('Son')).toBeInTheDocument()
    expect(screen.getAllByText('Lakshmi Chakali').length).toBeGreaterThanOrEqual(2)      // once in the golden record as spouse, once in the household
    expect(screen.getAllByText('Spouse').length).toBeGreaterThanOrEqual(2)       // the golden record row and the household relation
    expect(screen.getByText('this person')).toBeInTheDocument()
  })

  const rec = (id, src, rid, score, extra = {}) => ({ id, source: src, source_name: src.toUpperCase(), rtype: 'income', source_rid: rid, name: 'Anil Chakali', link_status: 'AUTO_LINKED', score,
    evidence: { components: { dob: { score: 0.5, note: 'one month apart' }, name: { score: 1, note: 'exact' } }, penalties: [] }, ...extra })
  const person9 = () => route({
    '/x/persons/9/household': { person: { id: 9 }, cards: [], caveats: [], members: [] },
    '/x/persons/9/exchange': { identity: { linked: false, note: 'none' }, consents: [], exchanges: [] },
    '/persons/9': { person: { id: 9, mdm_id: 'MDM-9', name: 'Anil Chakali', gender: 'M', dob: '1985-07-21', district: 'Nalgonda', source_count: 3, confidence: 0.79, life_status: 'NO_DEATH_RECORD' },
      attributes: [], issues: [{ id: 1, code: 'DOB_CONFLICT', severity: 'HIGH', detail: 'x', status: 'OPEN' }], audit: [], missing_sources: [], relationships: [],
      records: [rec(1, 'crs', 'CRS-1', null, { link_status: 'ANCHOR', rtype: 'birth' }),
        rec(2, 'revenue', 'RV-1', 0.79, { evidence: { components: { name: { score: 1, weight: 0.4, note: 'exact' }, dob: { score: null, weight: 0.25, note: '' }, gender: { score: null, weight: 0.05, note: '' }, district: { score: 1, weight: 0.05, note: '' }, mandal: { score: 1, weight: 0.05, note: '' }, village: { score: 1, weight: 0.05, note: '' } }, info_weight: 0.55, cap: 0.786, penalties: [], total: 0.79 } }),
        rec(3, 'pds', 'PDS-1', 0.93, { evidence: { components: { name: { score: 1, weight: 0.4, note: '' }, dob: { score: 0, weight: 0.25, note: 'differs' }, address: { score: 1, weight: 0.15, note: '' } }, info_weight: 0.8, cap: 1, penalties: ['date of birth mismatch'], total: 0.93 } })] },
    '/records/2/unlink': { record_id: 2, old_person_id: 9, new_person_id: 10 },
  })

  it('opens only the first box, and explains the confidence as the weakest link', async () => {
    globalThis.fetch = person9()
    render(<MemoryRouter><Person360 id={9} back={() => {}} openPerson={() => {}} /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /Data issues/ })).toHaveAttribute('aria-expanded', 'true')
    for (const n of [/Identity link and consent/, /The golden record/, /Family and household/, /Where this came from/, /Department records/]) {
      expect(await screen.findByRole('button', { name: n })).toHaveAttribute('aria-expanded', 'false')
    }
    const tip = screen.getByRole('tooltip', { hidden: true })   // shown on hover; hidden by CSS until then
    expect(tip).toHaveTextContent('Why 79%?')
    expect(tip).toHaveTextContent('weakest automatic link')
    expect(tip).toHaveTextContent('REVENUE')
    expect(tip).toHaveTextContent('Not scored')
    expect(tip).toHaveTextContent('Thin evidence: the record gives only name, district, mandal and village')
    expect(tip).toHaveTextContent('capped at 79%')
    expect(tip).toHaveTextContent('76% or more links automatically')
    fireEvent.click(screen.getByRole('button', { name: /Department records/ }))
    expect(await screen.findByText('Thin evidence')).toBeInTheDocument()
    expect(screen.getByText('Conflicting evidence')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('Why this match')[0])
    expect(screen.getAllByText(/Evidence available: /)[0]).toHaveTextContent('0.55 of the 0.70 needed')
  })

  it('separates a record from a side panel, only with a reason', async () => {
    const f = person9()
    globalThis.fetch = f
    const open = vi.fn()
    render(<MemoryRouter><Person360 id={9} back={() => {}} openPerson={open} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Department records/ }))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Not this person' }))[1])
    const dlg = await screen.findByRole('dialog', { name: /Separate this record/ })
    expect(dlg).toHaveTextContent('What happens when you confirm')
    expect(dlg).toHaveTextContent('RV-1')
    const go = screen.getByRole('button', { name: 'Separate this record' })
    expect(go).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'different village on the land record' } })
    expect(go).not.toBeDisabled()
    fireEvent.click(go)
    await waitFor(() => expect(f.mock.calls.some(([u, i]) => String(u).includes('/records/2/unlink') && JSON.parse(i.body).note === 'different village on the land record')).toBe(true))
    expect(await screen.findByText(/now a separate person/)).toBeInTheDocument()
  })

  it('continues from a person waiting for a steward into the review queue and back', async () => {
    globalThis.fetch = route({
      '/x/persons/8/household': { person: { id: 8 }, cards: [], caveats: [], members: [] },
      '/x/persons/8/exchange': { identity: { linked: false, note: 'none' }, consents: [], exchanges: [] },
      '/persons/8': { person: { id: 8, mdm_id: 'MDM-8', name: 'Praveen Gangaputra', gender: 'M', dob: null, district: 'Sangareddy', source_count: 1, confidence: 1, life_status: 'NO_DEATH_RECORD' },
        attributes: [], issues: [], audit: [], missing_sources: [], relationships: [],
        records: [{ id: 4, source: 'identity_reference', source_name: 'Identity reference service', rtype: 'identity', source_rid: 'IDR-1', name: 'Praveen Gangaputra', link_status: 'IN_REVIEW', score: 0.9, evidence: null }] },
      '/review/9': task,
      '/review': { total: 1, limit: 20, offset: 0, items: [{ id: 9, name: 'Praveen Gangaputra', source: 'identity_reference', source_name: 'Identity reference service', source_rid: 'IDR-1', score: 0.9, candidate_count: 2, district: 'Sangareddy' }] },
      '/sources': [],
    })
    render(<MemoryRouter initialEntries={['/mdm?tab=people&person=8']}><MdmHub /></MemoryRouter>)
    expect(await screen.findByText(/waiting for a steward/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review IDR-1' }))
    expect(await screen.findByRole('button', { name: /Record to place/ })).toBeInTheDocument()       // the one record is opened for the steward straight away
    fireEvent.click(screen.getByRole('button', { name: '← Back to the person' }))
    expect(await screen.findByText('Praveen Gangaputra', { selector: 'h1, h2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search the review queue by name' })).toBeInTheDocument()
  })

  it('lists only the people waiting for review when the box is ticked', async () => {
    const calls = []
    globalThis.fetch = route({ '/persons/facets': { districts: [] }, '/persons': { total: 1, limit: 25, offset: 0, items: [{ id: 8, mdm_id: 'MDM-8', name: 'Praveen Gangaputra', source_count: 1, open_issues: 0, in_review: 1, life_status: 'NO_DEATH_RECORD' }] } }, calls)
    render(<MemoryRouter initialEntries={['/mdm?tab=people']}><MdmHub /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Waiting for review' }))
    await waitFor(() => expect(calls.some((c) => c.includes('/persons?') && c.includes('in_review=true'))).toBe(true))
  })

  it('says so plainly when a person has been absorbed by a link, and sends the officer on', async () => {
    globalThis.fetch = vi.fn(async (u) => (String(u).includes('/persons/77') ? { ok: false, status: 404, json: async () => ({ detail: 'Person not found' }) } : json({})))
    render(<MemoryRouter initialEntries={['/mdm?tab=people&person=77']}><MdmHub /></MemoryRouter>)
    expect(await screen.findByText('This person no longer exists.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open the review queue' })).toBeInTheDocument()
  })

  it('tells a person which waiting records elsewhere could belong to them', async () => {
    const f = person9()
    globalThis.fetch = vi.fn(async (u, i) => String(u).includes('/persons/9') ? json({ ...(await (await f(u, i)).json()), could_belong: [{ task_id: 5, source: 'housing', source_name: 'Housing', source_rid: 'HSG-1', score: 0.7857 }] }) : f(u, i))
    render(<MemoryRouter><Person360 id={9} back={() => {}} openPerson={() => {}} /></MemoryRouter>)
    expect(await screen.findByText(/more record waiting for a steward could belong to this person/)).toBeInTheDocument()
    expect(screen.getByText(/Housing HSG-1 \(79%\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review HSG-1' })).toBeInTheDocument()
  })
})

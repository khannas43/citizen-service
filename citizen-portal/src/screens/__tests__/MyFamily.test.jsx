import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import en from '../../locales/en.json'
import te from '../../locales/te.json'
import MyFamily from '../MyFamily'

vi.mock('../../approvalsApi', () => ({
  fetchHousehold: vi.fn(),
}))

vi.mock('../../api', () => ({
  fetchFamily: vi.fn(),
  fetchFamilyIncome: vi.fn(),
  fetchFamilyBeneficiaries: vi.fn(),
}))

vi.mock('../../auth', () => ({
  loadCitizenProfile: () => ({
    name: 'Rajender',
    aadhaarRef: 'XXXX-XXXX-2001',
    familyId: 'FAM-TEST',
  }),
}))

vi.mock('../../components/MemberProfile360', () => ({ default: () => null }))
vi.mock('../../components/SchemeRecommendations', () => ({ default: () => null }))

import { fetchHousehold } from '../../approvalsApi'
import { fetchFamily, fetchFamilyIncome, fetchFamilyBeneficiaries } from '../../api'

const familyPayload = {
  rationCardNumber: 'RC-9999',
  village: 'Demo',
  taluka: 'Demo',
  district: 'Demo',
  members: [
    {
      id: 1,
      name: 'Rajender',
      relationshipToHead: 'HEAD',
      aadhaarRef: 'XXXX-XXXX-2001',
      dob: '1978-09-12',
      occupation: 'Farmer',
      annualIncome: 120000,
      casteCategory: 'BC',
      isAlive: true,
    },
    {
      id: 2,
      name: 'Suma',
      relationshipToHead: 'SPOUSE',
      aadhaarRef: 'XXXX-XXXX-2002',
      dob: '1980-04-18',
      occupation: 'Home',
      annualIncome: 0,
      casteCategory: 'BC',
      isAlive: true,
    },
  ],
}

const masterWithChild = {
  items: [
    { person_ref: 'r1', name: 'Rajender', relationship_to_me: 'SELF', age_band: '18 to 59', registered_via: null, on_ration_card: true, added_on: null },
    { person_ref: 'r2', name: 'Suma', relationship_to_me: 'SPOUSE', age_band: '18 to 59', registered_via: null, on_ration_card: true, added_on: null },
    {
      person_ref: 'r3',
      name: 'Newborn Child',
      relationship_to_me: 'CHILD',
      age: 0,
      age_band: '0 to 1',
      registered_via: 'BIRTH_REGISTRATION',
      on_ration_card: false,
      added_on: '2026-10-31',
    },
  ],
  ration_cards: ['9999'],
  count: 3,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyFamily />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  fetchFamily.mockResolvedValue(familyPayload)
  fetchFamilyIncome.mockResolvedValue({ totalAnnualIncome: 120000, breakdown: [] })
  fetchFamilyBeneficiaries.mockResolvedValue([])
  fetchHousehold.mockResolvedValue(masterWithChild)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('MyFamily master-record household', () => {
  it('puts the birth-registration child in a master table row with the birth label', async () => {
    renderPage()
    const row = await screen.findByTestId('master-member-row')
    expect(within(row).getByText('Newborn Child')).toBeInTheDocument()
    expect(within(row).getByText(en.myFamilyPage.masterRecord.birthLabel, { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(/2026-10-31/)).toBeInTheDocument()
    expect(within(row).getByText(`0 ${en.myFamilyPage.years}`)).toBeInTheDocument()
    // Title is only for loading / error / unavailable / empty — not when members are in the table
    expect(screen.queryByText(en.myFamilyPage.masterRecord.title)).toBeNull()
    expect(screen.getByText('Rajender')).toBeInTheDocument()
  })

  it('does not duplicate a person already in the family list', async () => {
    renderPage()
    await waitFor(() => expect(fetchHousehold).toHaveBeenCalled())
    const rows = await screen.findAllByTestId('master-member-row')
    const rowText = rows.map((r) => r.textContent).join(' | ')
    expect(rowText).toContain('Newborn Child')
    expect(rowText).not.toMatch(/Rajender/)
    expect(rowText).not.toMatch(/Suma/)
    expect(screen.getAllByText('Suma')).toHaveLength(1)
  })

  it('leaves the old list intact when the master route fails', async () => {
    fetchHousehold.mockRejectedValue(Object.assign(new Error('failed'), { status: 500 }))
    renderPage()
    expect(await screen.findByText('Suma')).toBeInTheDocument()
    expect(screen.getByText('Rajender')).toBeInTheDocument()
    expect(await screen.findByText(en.myFamilyPage.masterRecord.error)).toBeInTheDocument()
    expect(screen.getByText(en.myFamilyPage.masterRecord.title)).toBeInTheDocument()
    expect(screen.queryByText('Newborn Child')).not.toBeInTheDocument()
    expect(screen.queryByTestId('master-member-row')).toBeNull()
  })

  it('renders Telugu birth label and relationship in the master table row', async () => {
    await i18n.changeLanguage('te')
    renderPage()
    const row = await screen.findByTestId('master-member-row')
    expect(within(row).getByText(te.myFamilyPage.masterRecord.birthLabel, { exact: false })).toBeInTheDocument()
    expect(within(row).getByText(te.myFamilyPage.masterRecord.rel.CHILD)).toBeInTheDocument()
    expect(screen.queryByText(te.myFamilyPage.masterRecord.title)).toBeNull()
  })

  it('shows the master-record title when the list is empty', async () => {
    fetchHousehold.mockResolvedValue({ items: [], ration_cards: [], count: 0 })
    renderPage()
    expect(await screen.findByText(en.myFamilyPage.masterRecord.title)).toBeInTheDocument()
    expect(screen.getByText(en.myFamilyPage.masterRecord.empty)).toBeInTheDocument()
    expect(screen.queryByTestId('master-member-row')).toBeNull()
  })

  it('does not show a master id or a full ration card in the DOM', async () => {
    fetchHousehold.mockResolvedValue({
      ...masterWithChild,
      ration_cards: ['1234'],
      items: [
        ...masterWithChild.items,
        {
          person_ref: 'opaque-only',
          name: 'Uncle',
          relationship_to_me: 'SAME_CARD',
          age_band: '18 to 59',
          registered_via: null,
          on_ration_card: true,
          added_on: null,
        },
      ],
    })
    const { container } = renderPage()
    await screen.findByText('Newborn Child')
    const html = container.textContent || ''
    expect(html).not.toMatch(/person_id/i)
    expect(html).not.toMatch(/mdm_id/i)
    expect(html).not.toMatch(/RC-HH-|RC-99991234/)
    expect(html).not.toContain('RC-HH-FULLCARD1234')
  })
})

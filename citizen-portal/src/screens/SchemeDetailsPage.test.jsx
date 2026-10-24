import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SchemeDetailsPage from './SchemeDetailsPage'
import { GUEST_PROFILE_KEY } from '../guestEligibility/eligibilitySession'
import i18n from '../i18n'

vi.mock('../components/LandingChromeHeader', () => ({
  default: () => <div data-testid="landing-header" />,
}))

vi.mock('../api', () => ({
  fetchSchemePublicDetails: vi.fn(),
  fetchNearbyOffices: vi.fn(),
}))

import { fetchSchemePublicDetails, fetchNearbyOffices } from '../api'

const SCHEME_ID = 'a1000001-0000-0000-0000-000000000004'

const fixture = {
  id: SCHEME_ID,
  name: 'Widow Pension',
  nameGujarati: 'વિધવા પેન્શન',
  description: 'Support for widows in Gujarat.',
  department: 'Social Justice',
  category: 'Pension',
  benefitType: 'MONTHLY',
  benefitValue: '1250',
  status: 'ACTIVE',
  validFrom: '2020-01-01',
  validTo: '2030-12-31',
  benefitComponents: [],
  eligibility: [
    { key: 'maritalStatus', label: 'Marital status', labelGu: null, value: 'WIDOWED', operator: 'must be', source: 'OVERLAY' },
    { key: 'age', label: 'Age', labelGu: null, value: '18-60', operator: 'between', source: 'RULE' },
  ],
  documentsRequired: [{ title: 'Aadhaar', titleGu: null, note: 'Copy', noteGu: null }],
  applicationSteps: [{ title: 'Apply online', titleGu: null, detail: 'Use the portal', detailGu: null }],
  faqs: [{ question: 'Who can apply?', questionGu: null, answer: 'Eligible widows.', answerGu: null }],
  helplineLabel: 'Helpline',
  helplineNumber: '1800-000-000',
  officialUrl: 'https://example.gov.in',
  contentIsSample: true,
  relatedSchemes: [{ id: 'b2000002-0000-0000-0000-000000000001', name: 'Other Scheme', nameGujarati: null }],
}

function renderPage(schemeId = SCHEME_ID) {
  return render(
    <MemoryRouter initialEntries={[`/schemes/${schemeId}`]}>
      <Routes>
        <Route path="/schemes/:schemeId" element={<SchemeDetailsPage guestShell />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SchemeDetailsPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(fetchSchemePublicDetails).mockResolvedValue(fixture)
    vi.mocked(fetchNearbyOffices).mockResolvedValue({ offices: [] })
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders fixture sections', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Widow Pension', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Support for widows in Gujarat.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Documents checklist' })).toBeInTheDocument()
    expect(screen.getByText('Aadhaar')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How to apply' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Other Scheme' })).toHaveAttribute('href', `/schemes/${fixture.relatedSchemes[0].id}`)
  })

  it('shows not found when scheme missing', async () => {
    vi.mocked(fetchSchemePublicDetails).mockRejectedValue(new Error('Scheme not found: x (HTTP 404)'))
    renderPage('missing-id')
    expect(await screen.findByRole('heading', { name: 'Scheme not found' })).toBeInTheDocument()
  })

  it('shows criterion status from guest session match', async () => {
    sessionStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify({
      form: { district: 'Ahmedabad' },
      result: {
        matches: [{
          schemeId: SCHEME_ID,
          outcome: 'NOT_ELIGIBLE',
          eligible: false,
          reasons: [{ text: 'Marital status must be widowed', passed: false }],
          missingFields: [],
        }],
      },
    }))
    renderPage()
    await screen.findByText('Marital status')
    const notMet = document.querySelector('.crit-status.not-met')
    expect(notMet).toBeTruthy()
    expect(notMet).toHaveTextContent('✗')
  })

  it('shows sample content banner', async () => {
    renderPage()
    expect(await screen.findByText(/sample content for demonstration/i)).toBeInTheDocument()
  })

  it('FAQ accordion toggles aria-expanded', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: /Who can apply\?/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('Eligible widows.')).toBeInTheDocument()
  })

  it('shows the officer-written benefit and eligibility guidance', async () => {
    vi.mocked(fetchSchemePublicDetails).mockResolvedValue({
      ...fixture,
      benefitsNote: 'Paid into the bank account every month.',
      eligibilityNote: 'Remarried widows are not eligible.',
    })
    renderPage()
    expect(await screen.findByText('Paid into the bank account every month.')).toBeInTheDocument()
    expect(screen.getByText('Remarried widows are not eligible.')).toBeInTheDocument()
  })

  it('shows no guidance boxes when officers have not written any', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Widow Pension', level: 1 })
    expect(document.querySelector('.scheme-details-note')).toBeNull()
  })

  describe('in Gujarati', () => {
    beforeEach(async () => { await i18n.changeLanguage('gu') })
    afterEach(async () => { await i18n.changeLanguage('en') })

    it('prefers the Gujarati overview and notes, and falls back to English when none was written', async () => {
      vi.mocked(fetchSchemePublicDetails).mockResolvedValue({
        ...fixture,
        overviewGu: 'ગુજરાતમાં વિધવાઓ માટે સહાય.',
        benefitsNote: 'English benefit note only.',
        benefitsNoteGu: 'માસિક બેંક ખાતામાં જમા.',
        eligibilityNote: 'English eligibility note only.',
      })
      renderPage()
      expect(await screen.findByText('ગુજરાતમાં વિધવાઓ માટે સહાય.')).toBeInTheDocument()
      expect(screen.getByText('માસિક બેંક ખાતામાં જમા.')).toBeInTheDocument()
      expect(screen.queryByText('Support for widows in Gujarat.')).toBeNull()
      // no Gujarati eligibility note was written, so the English one is shown rather than nothing
      expect(screen.getByText('English eligibility note only.')).toBeInTheDocument()
    })
  })
})

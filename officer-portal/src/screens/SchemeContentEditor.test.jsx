import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import SchemeContentEditor, { formatBenefitHeadline, formatCriterionValue, validateSchemeContentDraft } from './SchemeContentEditor.jsx'

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchSchemeContentList: vi.fn(),
    fetchSchemeContent: vi.fn(),
    fetchSchemeContentHistory: vi.fn(),
    saveSchemeContent: vi.fn(),
  }
})

vi.mock('../screens/TaskQueue', () => ({ default: () => <div>Tasks</div> }))
vi.mock('../screens/SchemeManagement', () => ({ default: () => <div>Schemes</div> }))
vi.mock('../screens/BeneficiaryDashboard', () => ({ default: () => null }))
vi.mock('../screens/SchemeCoverage', () => ({ default: () => null }))
vi.mock('../screens/FraudSignals', () => ({ default: () => null }))
vi.mock('../screens/SchemeSimulator', () => ({ default: () => null }))
vi.mock('../screens/FamilyRegistry', () => ({ default: () => null }))
vi.mock('../screens/Reports', () => ({ default: () => null }))
vi.mock('../screens/AnalyticsDashboard', () => ({ default: () => null }))
vi.mock('../screens/OpsDashboard', () => ({ default: () => null }))
vi.mock('../screens/Grievances', () => ({ default: () => null }))
vi.mock('../screens/OfficerHome', () => ({ default: () => <div>Home</div> }))
vi.mock('../screens/FormDefinitionGovernance', () => ({ default: () => null }))
vi.mock('../ArchPanel', () => ({ default: () => null }))
vi.mock('../WorkflowPanel', () => ({ default: () => null }))
vi.mock('../OfficerLogin', () => ({ default: () => <div>Login</div> }))

import { fetchSchemeContent, fetchSchemeContentList, saveSchemeContent } from '../api.js'

function b64url(value) {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function syntheticToken() {
  const header = b64url({ alg: 'none', typ: 'JWT' })
  const payload = b64url({
    sub: 'officer',
    exp: Math.floor(Date.now() / 1000) + 3600,
    realm_access: { roles: ['IT_ADMIN'] },
  })
  return `${header}.${payload}.sig`
}

describe('SchemeContentEditor', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(fetchSchemeContentList).mockReset()
  })

  it('hides Scheme Content nav for IT_ADMIN', () => {
    localStorage.setItem('officer_token', syntheticToken())
    localStorage.setItem('officer_role', 'IT_ADMIN')
    localStorage.setItem('officer_name', 'IT Admin')

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: /scheme content/i })).not.toBeInTheDocument()
  })

  it('shows forbidden message when list API returns 403', async () => {
    const err = new Error('Forbidden')
    err.code = 'FORBIDDEN'
    vi.mocked(fetchSchemeContentList).mockRejectedValue(err)

    render(
      <MemoryRouter>
        <SchemeContentEditor />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('scheme-content-forbidden')).toBeInTheDocument()
    })
    expect(screen.getByRole('status')).toHaveTextContent(/cannot edit citizen-facing scheme content/i)
  })

  it('rejects HTML in FAQ answers client-side', () => {
    const errors = validateSchemeContentDraft({
      documentsRequired: [],
      applicationSteps: [],
      faqs: [{ question: 'Q?', questionGu: '', answer: '<b>bad</b>', answerGu: '' }],
      helplineLabel: '',
      helplineNumber: '',
      officialUrl: '',
    })
    expect(errors['faqs[0].answer']).toBe('HTML not allowed')
  })

  describe('Overview, Benefits and Who can apply sections', () => {
    const SCHEME_ID = 'a1000001-0000-0000-0000-000000000004'
    const detail = {
      schemeId: SCHEME_ID,
      schemeName: 'Widow Pension',
      department: 'Social Justice',
      documentsRequired: [],
      applicationSteps: [],
      faqs: [],
      helplineLabel: null,
      helplineNumber: null,
      officialUrl: null,
      overview: null,
      overviewGu: null,
      benefitsNote: null,
      benefitsNoteGu: null,
      eligibilityNote: null,
      eligibilityNoteGu: null,
      scheme: {
        description: 'Monthly pension for widows',
        benefitType: 'MONTHLY',
        benefitValue: '1250',
        benefitComponents: [],
        eligibility: [
          { key: 'age', label: 'Age', value: 'At least 18 years', source: 'SCHEME' },
          { key: 'maritalStatus', label: 'Marital status', value: 'WIDOWED', source: 'OVERLAY' },
        ],
      },
      contentSource: 'DEMO_SEED',
      version: 0,
      updatedBy: 'demo-seed',
      updatedAt: '2026-10-06T11:34:07',
    }

    async function openEditor() {
      vi.mocked(fetchSchemeContentList).mockResolvedValue([
        { schemeId: SCHEME_ID, name: 'Widow Pension', department: 'Social Justice', category: 'WOMEN_EMPOWERMENT', hasContent: true, contentSource: 'DEMO_SEED' },
      ])
      vi.mocked(fetchSchemeContent).mockResolvedValue(detail)
      render(
        <MemoryRouter>
          <SchemeContentEditor />
        </MemoryRouter>,
      )
      fireEvent.click(await screen.findByRole('option', { name: /Widow Pension/ }))
      await screen.findByRole('heading', { name: 'Overview' })
    }

    it('shows the three sections first, in the same order as the citizen page', async () => {
      await openEditor()
      const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
      expect(headings.slice(0, 4)).toEqual(['Overview', 'Benefits', 'Who can apply', 'Required documents'])
    })

    it('shows the scheme facts read-only: description, formatted benefit and criteria', async () => {
      await openEditor()
      expect(screen.getByText('Monthly pension for widows')).toBeInTheDocument()
      expect(screen.getByText('₹1,250 per month')).toBeInTheDocument()
      const criteria = screen.getByRole('list', { name: 'Eligibility criteria' })
      expect(within(criteria).getByText('Age')).toBeInTheDocument()
      expect(within(criteria).getByText('At least 18 years')).toBeInTheDocument()
      // facts are not editable inputs
      expect(within(criteria).queryByRole('textbox')).toBeNull()
    })

    it('saves the wording typed into the three sections', async () => {
      vi.mocked(saveSchemeContent).mockResolvedValue({ ...detail, version: 1, contentSource: 'OFFICER' })
      await openEditor()

      fireEvent.change(screen.getByLabelText(/Overview \(EN\)/), { target: { value: 'A monthly pension for widows.' } })
      fireEvent.change(screen.getByLabelText(/Benefit details \(EN\)/), { target: { value: 'Paid into the bank account.' } })
      fireEvent.change(screen.getByLabelText(/Eligibility guidance \(EN\)/), { target: { value: 'Remarried widows are not eligible.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(saveSchemeContent).toHaveBeenCalled())
      const [id, payload] = vi.mocked(saveSchemeContent).mock.calls[0]
      expect(id).toBe(SCHEME_ID)
      expect(payload.overview).toBe('A monthly pension for widows.')
      expect(payload.benefitsNote).toBe('Paid into the bank account.')
      expect(payload.eligibilityNote).toBe('Remarried widows are not eligible.')
      expect(payload.overviewGu).toBeNull()
    })

    it('rejects HTML and over-long text in the new sections before saving', () => {
      const base = { documentsRequired: [], applicationSteps: [], faqs: [], helplineLabel: '', helplineNumber: '', officialUrl: '' }
      expect(validateSchemeContentDraft({ ...base, overview: '<script>x</script>' }).overview).toBe('HTML not allowed')
      expect(validateSchemeContentDraft({ ...base, overview: 'x'.repeat(2001) }).overview).toBe('Max length 2000')
      expect(validateSchemeContentDraft({ ...base, benefitsNote: 'y'.repeat(1001) }).benefitsNote).toBe('Max length 1000')
      expect(validateSchemeContentDraft({ ...base, eligibilityNoteGu: '<b>x</b>' }).eligibilityNoteGu).toBe('HTML not allowed')
      expect(validateSchemeContentDraft({ ...base, overview: 'Plain text is fine.' })).toEqual({})
    })

    it('shows rule-based criteria values as words, but leaves caste codes alone', async () => {
      await openEditor()
      const criteria = screen.getByRole('list', { name: 'Eligibility criteria' })
      expect(within(criteria).getByText('Widowed')).toBeInTheDocument()
      expect(formatCriterionValue('OBC, SC, ST', 'SCHEME')).toBe('OBC, SC, ST')
      expect(formatCriterionValue('FARMER,AGRICULTURIST', 'OVERLAY')).toBe('Farmer, Agriculturist')
    })

    it('formats benefit headlines like the citizen page', () => {
      expect(formatBenefitHeadline('MONTHLY', '1250')).toBe('₹1,250 per month')
      expect(formatBenefitHeadline('ANNUAL', '500000')).toBe('₹5,00,000 per year')
      expect(formatBenefitHeadline('IN_KIND', '35kg/month')).toBe('35kg/month')
    })
  })
})

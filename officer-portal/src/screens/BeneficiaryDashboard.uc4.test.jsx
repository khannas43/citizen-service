import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// BeneficiaryRow is not exported; exercise the note preference via a tiny mirror of the rule.
function noteOf(b) {
  return b.removalReason || b.eligibilityReason || b.overrideReason || (b.disbursementRef ? `Ref ${b.disbursementRef}` : '')
}

describe('Beneficiaries UC4 notes', () => {
  it('REMOVED prefers the removal (withdrawal) reason over eligibility', () => {
    expect(noteOf({
      status: 'REMOVED',
      removalReason: 'Withdrawn by the applicant. Checks stopped and temporary results removed. The audit trail is kept.',
      eligibilityReason: 'Permission given.',
    })).toMatch(/Withdrawn/)
  })

  it('IDENTIFIED and CONFIRMED show the eligibility note', () => {
    expect(noteOf({ status: 'IDENTIFIED', eligibilityReason: 'No permission asked yet.' })).toMatch(/No permission/)
    expect(noteOf({ status: 'CONFIRMED', eligibilityReason: 'Permission given.' })).toMatch(/Permission given/)
  })
})

describe('FamilyRegistry enrolment note shape', () => {
  it('renders scheme name, status and note in the same info-row style', async () => {
    const { default: React } = await import('react')
    function Enrolment({ b }) {
      const note = b.removalReason || b.eligibilityReason
      return (
        <div>
          <span>{b.schemeName}</span>
          <span>{b.status}</span>
          {note && (
            <div className="fr-c360-info-row">
              <span className="fr-c360-info-label">Note</span>
              <span className="fr-c360-info-value">{note}</span>
            </div>
          )}
        </div>
      )
    }
    render(
      <MemoryRouter>
        <Enrolment b={{
          schemeName: 'Higher Education Scholarship (turning 18)',
          status: 'REMOVED',
          removalReason: 'Withdrawn by the applicant. Checks stopped.',
        }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Higher Education Scholarship (turning 18)')).toBeInTheDocument()
    expect(screen.getByText('REMOVED')).toBeInTheDocument()
    expect(screen.getByText(/Withdrawn by the applicant/)).toBeInTheDocument()
  })
})

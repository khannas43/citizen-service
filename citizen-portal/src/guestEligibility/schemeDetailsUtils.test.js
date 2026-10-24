import { describe, it, expect } from 'vitest'
import { criterionStatusFromMatch } from './schemeDetailsUtils'

describe('criterionStatusFromMatch', () => {
  it('marks missing fields as needs', () => {
    const match = { outcome: 'POSSIBLE', missingFields: ['maritalStatus'] }
    expect(criterionStatusFromMatch('maritalStatus', match)).toBe('needs')
  })

  it('marks a fully likely scheme without reason lines as met', () => {
    const match = { outcome: 'LIKELY_ELIGIBLE', missingFields: [] }
    expect(criterionStatusFromMatch('gender', match)).toBe('met')
  })

  it('uses each criterion\'s own reason line on a possible scheme', () => {
    const match = {
      outcome: 'POSSIBLE',
      missingFields: ['employmentStatus'],
      reasons: [
        { text: 'Age 36 ≥ 18 (minimum)', passed: true },
        { text: 'Caste OBC in eligible list', passed: true },
        { text: 'Income ₹1.20L < ₹5.00L (ceiling)', passed: true },
      ],
    }
    expect(criterionStatusFromMatch('age', match)).toBe('met')
    expect(criterionStatusFromMatch('casteCategory', match)).toBe('met')
    expect(criterionStatusFromMatch('annualIncome', match)).toBe('met')
    expect(criterionStatusFromMatch('employmentStatus', match)).toBe('needs')
    expect(criterionStatusFromMatch('gender', match)).toBeNull()
  })

  it('does not mark every criterion failed on a not-eligible scheme', () => {
    const match = {
      outcome: 'NOT_ELIGIBLE',
      missingFields: [],
      reasons: [
        { text: 'Income ₹4.00L > ₹3.00L (ceiling)', passed: false },
        { text: 'Caste OBC in eligible list', passed: true },
      ],
    }
    expect(criterionStatusFromMatch('annualIncome', match)).toBe('not_met')
    expect(criterionStatusFromMatch('casteCategory', match)).toBe('met')
    expect(criterionStatusFromMatch('gender', match)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { isValidVerhoeff } from '../src/runtime/verhoeff.js'
import {
  SYNTHETIC_AADHAAR_12,
  SYNTHETIC_VID_16,
  appendSyntheticVerhoeffCheck,
} from './verhoeff-fixtures.js'

describe('isValidVerhoeff', () => {
  it('accepts known short valid sequences and synthetic 12/16 fixtures', () => {
    const shortValid = appendSyntheticVerhoeffCheck('2363')
    expect(isValidVerhoeff(shortValid)).toBe(true)
    expect(isValidVerhoeff(SYNTHETIC_AADHAAR_12)).toBe(true)
    expect(SYNTHETIC_AADHAAR_12).toHaveLength(12)
    expect(isValidVerhoeff(SYNTHETIC_VID_16)).toBe(true)
    expect(SYNTHETIC_VID_16).toHaveLength(16)
  })

  it('rejects empty, non-digit, and one-digit mutations', () => {
    expect(isValidVerhoeff('')).toBe(false)
    expect(isValidVerhoeff('12a45')).toBe(false)
    expect(isValidVerhoeff('12 45')).toBe(false)

    const mutated = `${SYNTHETIC_AADHAAR_12.slice(0, 5)}${SYNTHETIC_AADHAAR_12[5] === '0' ? '1' : '0'}${SYNTHETIC_AADHAAR_12.slice(6)}`
    expect(mutated).toHaveLength(12)
    expect(mutated).not.toBe(SYNTHETIC_AADHAAR_12)
    expect(isValidVerhoeff(mutated)).toBe(false)

    const mutatedVid = `${SYNTHETIC_VID_16.slice(0, 8)}${SYNTHETIC_VID_16[8] === '0' ? '1' : '0'}${SYNTHETIC_VID_16.slice(9)}`
    expect(isValidVerhoeff(mutatedVid)).toBe(false)
  })

  it('preserves leading zeros (no Number conversion)', () => {
    const withLeadingZeros = appendSyntheticVerhoeffCheck('00000000000')
    expect(withLeadingZeros.startsWith('0')).toBe(true)
    expect(isValidVerhoeff(withLeadingZeros)).toBe(true)
    expect(isValidVerhoeff(`${withLeadingZeros.slice(0, -1)}1`)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import {
  isSafeChallengeId,
  isSafeOpaqueReference,
  isSafeVerificationRef,
} from '../src/runtime/opaque-reference.js'
import { isSafeIdentityTokenizationResult } from '../src/runtime/aadhaar-identifier.js'

describe('opaque reference validation', () => {
  it('rejects empty and whitespace references', () => {
    expect(isSafeOpaqueReference('', [])).toBe(false)
    expect(isSafeOpaqueReference('   ', [])).toBe(false)
    expect(isSafeOpaqueReference('tok-1', [])).toBe(true)
  })

  it('rejects challengeId and verificationRef that echo secrets', () => {
    const mobile = '9876543210'
    expect(isSafeChallengeId('chal-ok', mobile)).toBe(true)
    expect(isSafeChallengeId(mobile, mobile)).toBe(false)
    expect(isSafeChallengeId(`x${mobile}y`, mobile)).toBe(false)

    expect(isSafeVerificationRef('ver-ok', mobile, 'chal', '1234')).toBe(true)
    expect(isSafeVerificationRef(mobile, mobile, 'chal', '1234')).toBe(false)
    expect(isSafeVerificationRef('chal', mobile, 'chal', '1234')).toBe(false)
    expect(isSafeVerificationRef('1234', mobile, 'chal', '1234')).toBe(false)
    expect(isSafeVerificationRef('prefix-1234-suffix', mobile, 'chal', '1234')).toBe(false)
  })

  it('rejects Aadhaar tokens that contain the raw identifier', () => {
    const raw = '999990000001'
    expect(
      isSafeIdentityTokenizationResult(raw, {
        referenceToken: 'opaque-ref',
        lastFour: '0001',
      }),
    ).toBe(true)
    expect(
      isSafeIdentityTokenizationResult(raw, {
        referenceToken: raw,
        lastFour: '0001',
      }),
    ).toBe(false)
    expect(
      isSafeIdentityTokenizationResult(raw, {
        referenceToken: `tok-${raw}`,
        lastFour: '0001',
      }),
    ).toBe(false)
  })
})

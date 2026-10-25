import { describe, expect, it } from 'vitest'

import { resolveCanonicalFieldId } from '../src/runtime/field-id.js'
import { resolveFieldErrorMessages } from '../src/runtime/error-resolution.js'
import { parseDg20Extensions } from '../src/runtime/x-dg20.js'
import {
  anniversaryInYear,
  completedAgeYears,
  earliestDobForMaxAge,
  isAgeWithinGate,
  latestDobForMinAge,
  nextCivilDay,
  parseIsoDate,
  subtractYearsForCutoff,
} from '../src/runtime/civil-date.js'
import type { BilingualContent } from '@citizen/form-contract'

describe('field ID resolution', () => {
  it('preserves underscore-containing RJSF names exactly', () => {
    expect(
      resolveCanonicalFieldId(
        'applicant_full_name',
        { $id: 'root_applicant_full_name' },
        undefined,
      ),
    ).toBe('applicant_full_name')
    expect(
      resolveCanonicalFieldId('address_line_1', { $id: 'root_address_line_1' }, undefined),
    ).toBe('address_line_1')
    expect(resolveCanonicalFieldId('shortName', { $id: 'root_shortName' }, undefined)).toBe(
      'shortName',
    )
  })

  it('allows an injected resolver to map names', () => {
    const mapped = resolveCanonicalFieldId(
      'nested_name',
      { $id: 'root_person_nested_name' },
      () => {
        return 'canonical.person.name'
      },
    )
    expect(mapped).toBe('canonical.person.name')
  })
})

describe('bilingual error resolution', () => {
  const bilingual: BilingualContent = {
    labels: {},
    help: {},
    errors: {
      applicant_full_name: {
        en: 'Name is required',
        gu: 'નામ જરૂરી છે',
      },
      shortName: {
        en: 'Short name invalid',
        gu: '',
      },
    },
  }

  it('uses English localized error', () => {
    expect(
      resolveFieldErrorMessages({
        bilingual,
        fieldId: 'applicant_full_name',
        locale: 'en',
        rawErrors: ['must be string', 'is required'],
      }),
    ).toEqual(['Name is required'])
  })

  it('uses Gujarati localized error', () => {
    expect(
      resolveFieldErrorMessages({
        bilingual,
        fieldId: 'applicant_full_name',
        locale: 'gu',
        rawErrors: ['is required'],
      }),
    ).toEqual(['નામ જરૂરી છે'])
  })

  it('falls back from Gujarati to English when GU missing', () => {
    expect(
      resolveFieldErrorMessages({
        bilingual,
        fieldId: 'shortName',
        locale: 'gu',
        rawErrors: ['bad'],
      }),
    ).toEqual(['Short name invalid'])
  })

  it('falls back to raw RJSF errors when metadata absent', () => {
    expect(
      resolveFieldErrorMessages({
        bilingual,
        fieldId: 'unknown_field',
        locale: 'en',
        rawErrors: ['must match pattern', 'too long'],
      }),
    ).toEqual(['must match pattern', 'too long'])
  })
})

describe('x-dg20 parser', () => {
  it('parses known keys and ignores unknown / malformed content', () => {
    expect(
      parseDg20Extensions({ 'x-dg20': { verifyEmail: true, minAge: 18, foo: 'bar' } }),
    ).toEqual({
      verifyEmail: true,
      minAge: 18,
    })
    expect(parseDg20Extensions({ 'x-dg20': 'nope' })).toEqual({})
    expect(parseDg20Extensions(null)).toEqual({})
    expect(parseDg20Extensions({ 'x-dg20': { minAge: -1, maxAge: 1.5 } })).toEqual({})
  })
})

describe('civil date leap-day policy', () => {
  it('treats 29 Feb anniversary as 1 March in non-leap years', () => {
    const dob = parseIsoDate('2000-02-29')
    expect(dob).toBeDefined()
    if (!dob) {
      return
    }
    expect(anniversaryInYear(dob, 2025)).toEqual({ year: 2025, month: 3, day: 1 })
    expect(completedAgeYears(dob, parseIsoDate('2025-02-28')!)).toBe(24)
    expect(completedAgeYears(dob, parseIsoDate('2025-03-01')!)).toBe(25)
  })

  it('clamps inverse cutoffs to 28 Feb (not 1 March) in non-leap years', () => {
    const leapToday = parseIsoDate('2024-02-29')!
    expect(subtractYearsForCutoff(leapToday, 18)).toEqual({
      year: 2006,
      month: 2,
      day: 28,
    })
    expect(latestDobForMinAge(leapToday, 18)).toEqual({ year: 2006, month: 2, day: 28 })
  })
})

describe('civil date inclusive cutoffs', () => {
  const today = parseIsoDate('2026-07-20')!

  it('computes latest/earliest DOB for minAge 18 and maxAge 60', () => {
    expect(latestDobForMinAge(today, 18)).toEqual({ year: 2008, month: 7, day: 20 })
    expect(earliestDobForMaxAge(today, 60)).toEqual({ year: 1965, month: 7, day: 21 })
    expect(nextCivilDay({ year: 1965, month: 7, day: 20 })).toEqual({
      year: 1965,
      month: 7,
      day: 21,
    })
  })

  it('accepts and rejects inclusive age boundaries for today 2026-07-20', () => {
    expect(isAgeWithinGate(parseIsoDate('1965-07-20')!, today, 18, 60)).toBe(false)
    expect(isAgeWithinGate(parseIsoDate('1965-07-21')!, today, 18, 60)).toBe(true)
    expect(isAgeWithinGate(parseIsoDate('2008-07-20')!, today, 18, 60)).toBe(true)
    expect(isAgeWithinGate(parseIsoDate('2008-07-21')!, today, 18, 60)).toBe(false)
    expect(isAgeWithinGate(parseIsoDate('2026-07-21')!, today, 18, 60)).toBe(false)
    expect(completedAgeYears(parseIsoDate('1965-07-20')!, today)).toBe(61)
    expect(completedAgeYears(parseIsoDate('1965-07-21')!, today)).toBe(60)
    expect(completedAgeYears(parseIsoDate('2008-07-20')!, today)).toBe(18)
    expect(completedAgeYears(parseIsoDate('2008-07-21')!, today)).toBe(17)
  })

  it('covers leap-day cutoffs when today is 2024-02-29, 2025-02-28, and 2025-03-01', () => {
    const t20240229 = parseIsoDate('2024-02-29')!
    const t20250228 = parseIsoDate('2025-02-28')!
    const t20250301 = parseIsoDate('2025-03-01')!

    expect(latestDobForMinAge(t20240229, 18)).toEqual({ year: 2006, month: 2, day: 28 })
    // subtractYearsForCutoff(2024-02-29, 61) → 1963-02-28; next day → 1963-03-01
    expect(earliestDobForMaxAge(t20240229, 60)).toEqual({ year: 1963, month: 3, day: 1 })

    expect(latestDobForMinAge(t20250228, 18)).toEqual({ year: 2007, month: 2, day: 28 })
    // subtractYearsForCutoff(2025-02-28, 61) → 1964-02-28; next day → 1964-02-29
    expect(earliestDobForMaxAge(t20250228, 60)).toEqual({ year: 1964, month: 2, day: 29 })

    expect(latestDobForMinAge(t20250301, 18)).toEqual({ year: 2007, month: 3, day: 1 })
    // subtractYearsForCutoff(2025-03-01, 61) → 1964-03-01; next day → 1964-03-02
    expect(earliestDobForMaxAge(t20250301, 60)).toEqual({ year: 1964, month: 3, day: 2 })

    const dobFeb28 = parseIsoDate('2000-02-28')!
    const dobFeb29 = parseIsoDate('2000-02-29')!
    const dobMar01 = parseIsoDate('2000-03-01')!

    expect(completedAgeYears(dobFeb29, t20250228)).toBe(24)
    expect(completedAgeYears(dobFeb29, t20250301)).toBe(25)
    expect(completedAgeYears(dobFeb28, t20250228)).toBe(25)
    expect(completedAgeYears(dobMar01, t20250301)).toBe(25)
    expect(completedAgeYears(dobFeb29, t20240229)).toBe(24)
  })
})

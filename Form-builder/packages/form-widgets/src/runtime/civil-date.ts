/**
 * ISO calendar date helpers for DOB age gates.
 * Never use `new Date('YYYY-MM-DD')` (timezone-sensitive).
 *
 * Leap-day anniversary policy (v1): a 29 February birth date has its
 * anniversary on 1 March in non-leap years for completed-age calculation.
 *
 * Inverse cutoff policy (v1): when projecting today backwards into a non-leap
 * year that lacks 29 February, clamp to 28 February — do not use the
 * anniversary → 1 March mapping for cutoff derivation.
 */

export interface CivilDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30
  }
  return 31
}

export function parseIsoDate(iso: string): CivilDate | undefined {
  const match = ISO_DATE.exec(iso)
  if (!match) {
    return undefined
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return undefined
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return undefined
  }
  return { year, month, day }
}

export function formatIsoDate(date: CivilDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export function compareCivil(a: CivilDate, b: CivilDate): number {
  if (a.year !== b.year) {
    return a.year - b.year
  }
  if (a.month !== b.month) {
    return a.month - b.month
  }
  return a.day - b.day
}

/** Next calendar day (no Date arithmetic). */
export function nextCivilDay(date: CivilDate): CivilDate {
  const dim = daysInMonth(date.year, date.month)
  if (date.day < dim) {
    return { year: date.year, month: date.month, day: date.day + 1 }
  }
  if (date.month < 12) {
    return { year: date.year, month: date.month + 1, day: 1 }
  }
  return { year: date.year + 1, month: 1, day: 1 }
}

/**
 * Anniversary of DOB in a given year, applying leap-day → 1 March policy
 * for completed-age calculation only.
 */
export function anniversaryInYear(dob: CivilDate, year: number): CivilDate {
  if (dob.month === 2 && dob.day === 29 && !isLeapYear(year)) {
    return { year, month: 3, day: 1 }
  }
  const maxDay = daysInMonth(year, dob.month)
  return { year, month: dob.month, day: Math.min(dob.day, maxDay) }
}

/** Completed whole years between DOB and today (inclusive of birthday anniversary). */
export function completedAgeYears(dob: CivilDate, today: CivilDate): number {
  if (compareCivil(dob, today) > 0) {
    return -1
  }
  let age = today.year - dob.year
  const anniversary = anniversaryInYear(dob, today.year)
  if (compareCivil(today, anniversary) < 0) {
    age -= 1
  }
  return age
}

/**
 * Subtract whole years for inverse age cutoffs.
 * Feb 29 in a non-leap target year clamps to Feb 28 (not 1 March).
 */
export function subtractYearsForCutoff(date: CivilDate, years: number): CivilDate {
  const targetYear = date.year - years
  if (date.month === 2 && date.day === 29 && !isLeapYear(targetYear)) {
    return { year: targetYear, month: 2, day: 28 }
  }
  const maxDay = daysInMonth(targetYear, date.month)
  return { year: targetYear, month: date.month, day: Math.min(date.day, maxDay) }
}

/**
 * Latest DOB whose completed age is at least `minAge` (inclusive).
 * Example: today 2026-07-20, minAge 18 → 2008-07-20.
 */
export function latestDobForMinAge(today: CivilDate, minAge: number): CivilDate {
  return subtractYearsForCutoff(today, minAge)
}

/**
 * Earliest DOB whose completed age is at most `maxAge` (inclusive).
 * Example: today 2026-07-20, maxAge 60 → 1965-07-21
 * (1965-07-20 is age 61 and excluded).
 */
export function earliestDobForMaxAge(today: CivilDate, maxAge: number): CivilDate {
  return nextCivilDay(subtractYearsForCutoff(today, maxAge + 1))
}

export function isAgeWithinGate(
  dob: CivilDate,
  today: CivilDate,
  minAge: number | undefined,
  maxAge: number | undefined,
): boolean {
  if (compareCivil(dob, today) > 0) {
    return false
  }
  const age = completedAgeYears(dob, today)
  if (minAge !== undefined && age < minAge) {
    return false
  }
  if (maxAge !== undefined && age > maxAge) {
    return false
  }
  return true
}

/** @deprecated Prefer subtractYearsForCutoff for HTML min/max derivation. */
export function subtractYears(date: CivilDate, years: number): CivilDate {
  return subtractYearsForCutoff(date, years)
}

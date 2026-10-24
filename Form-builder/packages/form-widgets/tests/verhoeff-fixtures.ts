/**
 * TEST-ONLY synthetic Verhoeff fixtures.
 * Not for production use. Values are clearly synthetic — not citizen identifiers.
 */

const D: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

const P: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9] as const

/** @internal test-only — builds a valid Verhoeff digit string from a body. */
export function appendSyntheticVerhoeffCheck(body: string): string {
  let checksum = 0
  for (let i = 0; i < body.length; i += 1) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48
    checksum = D[checksum]![P[(i + 1) % 8]![digit]!]!
  }
  return `${body}${INV[checksum]}`
}

/** Clearly synthetic 12-digit Aadhaar-shaped fixture (not a real citizen ID). */
export const SYNTHETIC_AADHAAR_12 = appendSyntheticVerhoeffCheck('99999000000')

/** Clearly synthetic 16-digit VID-shaped fixture (not a real citizen ID). */
export const SYNTHETIC_VID_16 = appendSyntheticVerhoeffCheck('999990000000000')

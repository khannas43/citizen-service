/**
 * Verhoeff checksum over ASCII digit strings.
 * Processes characters only — never Number()/parseInt on the full identifier
 * (avoids leading-zero / precision loss).
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

const ASCII_DIGIT = /^[0-9]+$/

/**
 * Returns true when `digits` is a non-empty ASCII digit string with a valid
 * Verhoeff checksum.
 */
export function isValidVerhoeff(digits: string): boolean {
  if (digits.length === 0 || !ASCII_DIGIT.test(digits)) {
    return false
  }

  let checksum = 0
  for (let i = 0; i < digits.length; i += 1) {
    const digitChar = digits.charCodeAt(digits.length - 1 - i) - 48
    const permRow = P[i % 8]
    const mulRow = D[checksum]
    if (permRow === undefined || mulRow === undefined) {
      return false
    }
    const permuted = permRow[digitChar]
    if (permuted === undefined) {
      return false
    }
    const next = mulRow[permuted]
    if (next === undefined) {
      return false
    }
    checksum = next
  }
  return checksum === 0
}

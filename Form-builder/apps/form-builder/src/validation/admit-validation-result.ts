import type { ValidationIssue, ValidationResult, ValidationSeverity } from '@citizen/form-contract'

export const MAX_VALIDATION_ISSUES = 200

export type AdmitValidationResultOutcome =
  { readonly ok: true; readonly result: ValidationResult } | { readonly ok: false }

function isOrdinaryJsonObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  try {
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  } catch {
    return false
  }
}

function readOwnDataProperty(obj: object, key: string): unknown {
  try {
    const desc = Object.getOwnPropertyDescriptor(obj, key)
    if (!desc || desc.get !== undefined || desc.set !== undefined) {
      return undefined
    }
    return desc.value
  } catch {
    return undefined
  }
}

function hasHostileOwnShape(obj: object): boolean {
  try {
    if (Object.getOwnPropertySymbols(obj).length > 0) {
      return true
    }
    const names = Object.getOwnPropertyNames(obj)
    const enumerable = Object.keys(obj)
    if (names.length !== enumerable.length) {
      return true
    }
    for (const key of names) {
      const desc = Object.getOwnPropertyDescriptor(obj, key)
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return true
      }
    }
    return false
  } catch {
    return true
  }
}

function isNonblankUnpaddedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isSeverity(value: unknown): value is ValidationSeverity {
  return value === 'error' || value === 'warning' || value === 'info'
}

function admitIssue(raw: unknown): ValidationIssue | null {
  if (!isOrdinaryJsonObject(raw) || hasHostileOwnShape(raw)) {
    return null
  }
  const keys = Object.keys(raw)
  const allowed = new Set(['code', 'message', 'severity', 'path'])
  if (keys.length < 3 || keys.length > 4) {
    return null
  }
  for (const key of keys) {
    if (!allowed.has(key)) {
      return null
    }
  }
  if (!keys.includes('code') || !keys.includes('message') || !keys.includes('severity')) {
    return null
  }

  const code = readOwnDataProperty(raw, 'code')
  const message = readOwnDataProperty(raw, 'message')
  const severity = readOwnDataProperty(raw, 'severity')
  if (
    !isNonblankUnpaddedString(code) ||
    !isNonblankUnpaddedString(message) ||
    !isSeverity(severity)
  ) {
    return null
  }

  if (keys.includes('path')) {
    const path = readOwnDataProperty(raw, 'path')
    if (!isNonblankUnpaddedString(path)) {
      return null
    }
    return { code, message, severity, path }
  }

  return { code, message, severity }
}

/**
 * Exact dense Array.prototype issues array (FB-D6.1 / D6.1.1).
 * Each numeric index must be an own enumerable data property; length must be
 * the normal non-enumerable array length. Rejects sparse holes, accessor
 * indexes, extra own properties, symbols, and non-Array.prototype prototypes.
 * Never invokes getters.
 */
function admitIssuesArray(issuesRaw: unknown): ValidationIssue[] | null {
  if (!Array.isArray(issuesRaw)) {
    return null
  }
  try {
    if (Object.getPrototypeOf(issuesRaw) !== Array.prototype) {
      return null
    }
    if (Object.getOwnPropertySymbols(issuesRaw).length > 0) {
      return null
    }

    const lengthDesc = Object.getOwnPropertyDescriptor(issuesRaw, 'length')
    if (
      !lengthDesc ||
      lengthDesc.get !== undefined ||
      lengthDesc.set !== undefined ||
      lengthDesc.enumerable !== false ||
      typeof lengthDesc.value !== 'number' ||
      !Number.isSafeInteger(lengthDesc.value) ||
      lengthDesc.value < 0
    ) {
      return null
    }
    const length = lengthDesc.value
    if (length > MAX_VALIDATION_ISSUES) {
      return null
    }

    const names = Object.getOwnPropertyNames(issuesRaw)
    const expected = new Set<string>(['length'])
    for (let index = 0; index < length; index += 1) {
      expected.add(String(index))
    }
    if (names.length !== expected.size) {
      return null
    }
    for (const name of names) {
      if (!expected.has(name)) {
        return null
      }
    }

    const issues: ValidationIssue[] = []
    for (let index = 0; index < length; index += 1) {
      const desc = Object.getOwnPropertyDescriptor(issuesRaw, String(index))
      if (
        !desc ||
        desc.get !== undefined ||
        desc.set !== undefined ||
        desc.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(issuesRaw, String(index))
      ) {
        return null
      }
      const issue = admitIssue(desc.value)
      if (issue === null) {
        return null
      }
      issues.push(issue)
    }
    return issues
  } catch {
    return null
  }
}

/**
 * Strict admission of a ValidationResult from an adapter/HTTP body (FB-D6 / D6.1).
 * Never throws; never invokes getters; returns newly detached result objects.
 */
export function admitValidationResult(raw: unknown): AdmitValidationResultOutcome {
  try {
    if (!isOrdinaryJsonObject(raw) || hasHostileOwnShape(raw)) {
      return { ok: false }
    }
    const keys = Object.keys(raw)
    if (keys.length !== 2 || !keys.includes('valid') || !keys.includes('issues')) {
      return { ok: false }
    }

    const validRaw = readOwnDataProperty(raw, 'valid')
    const issuesRaw = readOwnDataProperty(raw, 'issues')
    if (typeof validRaw !== 'boolean') {
      return { ok: false }
    }

    const issues = admitIssuesArray(issuesRaw)
    if (issues === null) {
      return { ok: false }
    }

    const errorCount = issues.reduce(
      (count, issue) => (issue.severity === 'error' ? count + 1 : count),
      0,
    )
    if (validRaw !== (errorCount === 0)) {
      return { ok: false }
    }

    return {
      ok: true,
      result: {
        valid: validRaw,
        issues: issues.map((issue) =>
          issue.path !== undefined
            ? {
                code: issue.code,
                message: issue.message,
                severity: issue.severity,
                path: issue.path,
              }
            : { code: issue.code, message: issue.message, severity: issue.severity },
        ),
      },
    }
  } catch {
    return { ok: false }
  }
}

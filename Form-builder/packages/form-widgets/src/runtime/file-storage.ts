import type { FileStorageResult } from './service-ports.js'

/**
 * Governed package-wide maximum for configurable document uploads (FB-A5).
 * Field `x-dg20.maxFileSizeBytes` must be a positive safe integer ≤ this cap.
 */
export const DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES = 25 * 1024 * 1024

/**
 * Provisional photo-capture policy (FB-A5). Requires product/security confirmation
 * before treating as final production policy.
 */
export const PHOTO_CAPTURE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const
export const PHOTO_CAPTURE_MAX_BYTES = 5 * 1024 * 1024
export const PHOTO_CAPTURE_MIN_DIMENSION = 300
export const PHOTO_CAPTURE_MAX_DIMENSION = 4096

const CONTENT_URL_PREFIXES = ['data:', 'blob:', 'http://', 'https://'] as const

/**
 * Object-store / issuer references must be non-empty opaque strings — never
 * data:/blob:/http(s) content URLs. Exact object-store ref schema is unresolved.
 */
export function isSafeObjectStoreRef(reference: unknown): boolean {
  if (typeof reference !== 'string') {
    return false
  }
  const trimmed = reference.trim()
  if (trimmed.length === 0) {
    return false
  }
  const lower = trimmed.toLowerCase()
  for (const prefix of CONTENT_URL_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return false
    }
  }
  return true
}

export function isExactAllowedMimeType(mimeType: string, allowed: readonly string[]): boolean {
  return allowed.includes(mimeType)
}

export function isPositiveSafeByteSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export type DocumentUploadConfig =
  | {
      readonly ok: true
      readonly allowedMimeTypes: readonly string[]
      readonly maxFileSizeBytes: number
    }
  | { readonly ok: false }

/**
 * Resolves doc-upload x-dg20 config. Missing/empty MIME list or invalid size → invalid.
 */
export function resolveDocumentUploadConfig(input: {
  readonly allowedMimeTypes?: readonly string[]
  readonly maxFileSizeBytes?: number
}): DocumentUploadConfig {
  const types = input.allowedMimeTypes
  if (!types || types.length === 0) {
    return { ok: false }
  }
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const mime of types) {
    if (typeof mime !== 'string' || mime.trim().length === 0) {
      return { ok: false }
    }
    const exact = mime.trim()
    if (seen.has(exact)) {
      continue
    }
    seen.add(exact)
    normalized.push(exact)
  }
  if (normalized.length === 0) {
    return { ok: false }
  }
  const max = input.maxFileSizeBytes
  if (!isPositiveSafeByteSize(max) || max > DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES) {
    return { ok: false }
  }
  return { ok: true, allowedMimeTypes: normalized, maxFileSizeBytes: max }
}

/** Stable fingerprint for document upload policy changes (lifecycle invalidation). */
export function documentUploadConfigFingerprint(config: DocumentUploadConfig): string {
  if (!config.ok) {
    return 'invalid'
  }
  return `${config.allowedMimeTypes.join('\0')}:${config.maxFileSizeBytes}`
}

export type ClientFilePrecheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'mime' | 'size' }

export function precheckFileAgainstPolicy(
  file: File,
  allowedMimeTypes: readonly string[],
  maxFileSizeBytes: number,
): ClientFilePrecheck {
  if (!isExactAllowedMimeType(file.type, allowedMimeTypes)) {
    return { ok: false, reason: 'mime' }
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maxFileSizeBytes) {
    return { ok: false, reason: 'size' }
  }
  return { ok: true }
}

export type AcceptedCleanStorage = {
  readonly objectRef: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly width?: number
  readonly height?: number
}

export type SelectedFileIdentity = {
  readonly type: string
  readonly size: number
}

/**
 * Accepts only CLEAN adapter results with safe objectRef and matching metadata.
 * When selectedFile is provided, result MIME and size must exactly match the File.
 * Never accepts REJECTED or content-URL refs.
 */
export function acceptCleanFileStorageResult(
  result: FileStorageResult,
  options: {
    readonly allowedMimeTypes: readonly string[]
    readonly maxFileSizeBytes: number
    readonly selectedFile?: SelectedFileIdentity
    readonly requireDimensions?: boolean
    readonly minDimension?: number
    readonly maxDimension?: number
  },
): AcceptedCleanStorage | null {
  if (result.status !== 'CLEAN') {
    return null
  }
  if (!isSafeObjectStoreRef(result.objectRef)) {
    return null
  }
  if (!isExactAllowedMimeType(result.mimeType, options.allowedMimeTypes)) {
    return null
  }
  if (!isPositiveSafeByteSize(result.sizeBytes) || result.sizeBytes > options.maxFileSizeBytes) {
    return null
  }
  if (options.selectedFile) {
    if (result.mimeType !== options.selectedFile.type) {
      return null
    }
    if (result.sizeBytes !== options.selectedFile.size) {
      return null
    }
  }
  if (options.requireDimensions) {
    const min = options.minDimension ?? PHOTO_CAPTURE_MIN_DIMENSION
    const max = options.maxDimension ?? PHOTO_CAPTURE_MAX_DIMENSION
    if (
      typeof result.width !== 'number' ||
      typeof result.height !== 'number' ||
      !Number.isSafeInteger(result.width) ||
      !Number.isSafeInteger(result.height) ||
      result.width < min ||
      result.height < min ||
      result.width > max ||
      result.height > max
    ) {
      return null
    }
    return {
      objectRef: result.objectRef.trim(),
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes,
      width: result.width,
      height: result.height,
    }
  }
  return {
    objectRef: result.objectRef.trim(),
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
  }
}

export function resolveDigiLockerDocumentTypeCode(
  value: string | undefined,
): { readonly ok: true; readonly code: string } | { readonly ok: false } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false }
  }
  return { ok: true, code: value.trim() }
}

export function acceptDigiLockerFetchResult(
  result: {
    readonly issuerSignedRef: unknown
    readonly documentTypeCode: unknown
  },
  requestedCode: string,
): { readonly issuerSignedRef: string; readonly documentTypeCode: string } | null {
  if (typeof result.documentTypeCode !== 'string' || result.documentTypeCode !== requestedCode) {
    return null
  }
  if (typeof result.issuerSignedRef !== 'string' || !isSafeObjectStoreRef(result.issuerSignedRef)) {
    return null
  }
  return {
    issuerSignedRef: result.issuerSignedRef.trim(),
    documentTypeCode: requestedCode,
  }
}

/** Presentation-only parse of incoming document formData (never silently rewritten). */
export function parseStoredDocumentReference(
  value: unknown,
  policy: { readonly allowedMimeTypes: readonly string[]; readonly maxFileSizeBytes: number },
):
  | {
      readonly objectRef: string
      readonly fileName: string
      readonly mimeType: string
      readonly sizeBytes: number
      readonly scanStatus: 'CLEAN'
    }
  | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  if (record.scanStatus !== 'CLEAN') {
    return undefined
  }
  if (typeof record.fileName !== 'string' || record.fileName.trim().length === 0) {
    return undefined
  }
  if (typeof record.objectRef !== 'string' || !isSafeObjectStoreRef(record.objectRef)) {
    return undefined
  }
  if (
    typeof record.mimeType !== 'string' ||
    !isExactAllowedMimeType(record.mimeType, policy.allowedMimeTypes)
  ) {
    return undefined
  }
  if (!isPositiveSafeByteSize(record.sizeBytes) || record.sizeBytes > policy.maxFileSizeBytes) {
    return undefined
  }
  return {
    objectRef: record.objectRef.trim(),
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    scanStatus: 'CLEAN',
  }
}

/** Presentation-only parse of incoming photo formData. */
export function parseStoredPhotoReference(value: unknown):
  | {
      readonly objectRef: string
      readonly mimeType: string
      readonly sizeBytes: number
      readonly width: number
      readonly height: number
      readonly scanStatus: 'CLEAN'
    }
  | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  if (record.scanStatus !== 'CLEAN') {
    return undefined
  }
  if (typeof record.objectRef !== 'string' || !isSafeObjectStoreRef(record.objectRef)) {
    return undefined
  }
  if (
    typeof record.mimeType !== 'string' ||
    !isExactAllowedMimeType(record.mimeType, PHOTO_CAPTURE_ALLOWED_MIME_TYPES)
  ) {
    return undefined
  }
  if (!isPositiveSafeByteSize(record.sizeBytes) || record.sizeBytes > PHOTO_CAPTURE_MAX_BYTES) {
    return undefined
  }
  if (
    typeof record.width !== 'number' ||
    typeof record.height !== 'number' ||
    !Number.isSafeInteger(record.width) ||
    !Number.isSafeInteger(record.height) ||
    record.width < PHOTO_CAPTURE_MIN_DIMENSION ||
    record.height < PHOTO_CAPTURE_MIN_DIMENSION ||
    record.width > PHOTO_CAPTURE_MAX_DIMENSION ||
    record.height > PHOTO_CAPTURE_MAX_DIMENSION
  ) {
    return undefined
  }
  return {
    objectRef: record.objectRef.trim(),
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    width: record.width,
    height: record.height,
    scanStatus: 'CLEAN',
  }
}

/** Presentation-only parse; type code must match the current configured DigiLocker type. */
export function parseStoredDigiLockerValue(
  value: unknown,
  expectedTypeCode: string | undefined,
):
  | {
      readonly issuerSignedRef: string
      readonly documentTypeCode: string
    }
  | undefined {
  if (typeof expectedTypeCode !== 'string' || expectedTypeCode.trim().length === 0) {
    return undefined
  }
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as { issuerSignedRef?: unknown; documentTypeCode?: unknown }
  if (typeof record.documentTypeCode !== 'string' || record.documentTypeCode !== expectedTypeCode) {
    return undefined
  }
  if (typeof record.issuerSignedRef !== 'string' || !isSafeObjectStoreRef(record.issuerSignedRef)) {
    return undefined
  }
  return {
    issuerSignedRef: record.issuerSignedRef.trim(),
    documentTypeCode: expectedTypeCode,
  }
}

/**
 * Strict citizen-field schema admission (FB-D5.1).
 * Never repairs; never invokes accessors; never embeds hostile values in messages.
 */

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

/** Own data value without invoking getters/setters. */
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

/**
 * True when the object has symbol keys, non-enumerable string keys, or
 * accessor own properties — hostile for FormDefinition JSON.
 */
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

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isIntegerAtLeastOne(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

/**
 * Admit a required array with an exact member set (once each).
 * Rejects sparse holes, accessors, non-strings, duplicates, and extras.
 * Does not invoke getters.
 */
function admitExactRequiredMembers(
  requiredRaw: unknown,
  expectedMembers: readonly string[],
): boolean {
  if (!Array.isArray(requiredRaw)) {
    return false
  }
  try {
    if (Object.getOwnPropertySymbols(requiredRaw).length > 0) {
      return false
    }
    if (requiredRaw.length !== expectedMembers.length) {
      return false
    }
    const seen = new Set<string>()
    for (let index = 0; index < requiredRaw.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(requiredRaw, index)) {
        return false
      }
      const desc = Object.getOwnPropertyDescriptor(requiredRaw, index)
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return false
      }
      const value = desc.value
      if (typeof value !== 'string') {
        return false
      }
      if (!expectedMembers.includes(value) || seen.has(value)) {
        return false
      }
      seen.add(value)
    }
    for (const member of expectedMembers) {
      if (!seen.has(member)) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

/** Exact own enumerable string key set for a properties bag. */
function hasExactPropertyMembers(
  properties: Record<string, unknown>,
  expectedMembers: readonly string[],
): boolean {
  try {
    const keys = Object.keys(properties)
    if (keys.length !== expectedMembers.length) {
      return false
    }
    for (const key of expectedMembers) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        return false
      }
    }
    for (const key of keys) {
      if (!expectedMembers.includes(key)) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

export type XDg20AdmissionResult<T> =
  | { readonly kind: 'absent' }
  | { readonly kind: 'valid'; readonly value: T }
  | { readonly kind: 'invalid' }

export interface AdmittedEmailXDg20 {
  /** Present only when the key exists; must be boolean. */
  readonly verifyEmail?: boolean
}

export interface AdmittedDobXDg20 {
  readonly minAge?: number
  readonly maxAge?: number
}

/**
 * Admit email `x-dg20`: absent, or ordinary object with exact key set
 * `{ verifyEmail? }` where verifyEmail is boolean when present.
 */
export function admitEmailXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<AdmittedEmailXDg20> {
  if (!Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'absent' }
  }
  const raw = readOwnDataProperty(schema as object, 'x-dg20')
  if (raw === undefined && Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    // Own key exists but is an accessor (or unreadable) — invalid.
    return { kind: 'invalid' }
  }
  if (!isOrdinaryJsonObject(raw) || hasHostileOwnShape(raw)) {
    return { kind: 'invalid' }
  }
  const keys = Object.keys(raw)
  for (const key of keys) {
    if (key !== 'verifyEmail') {
      return { kind: 'invalid' }
    }
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'verifyEmail')) {
    const verifyEmail = readOwnDataProperty(raw, 'verifyEmail')
    if (typeof verifyEmail !== 'boolean') {
      return { kind: 'invalid' }
    }
    return { kind: 'valid', value: { verifyEmail } }
  }
  return { kind: 'valid', value: {} }
}

/**
 * Admit DOB `x-dg20`: absent, or ordinary object with exact key set
 * `{ minAge?, maxAge? }` as nonnegative safe integers; minAge <= maxAge when both set.
 */
export function admitDobXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<AdmittedDobXDg20> {
  if (!Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'absent' }
  }
  const raw = readOwnDataProperty(schema as object, 'x-dg20')
  if (raw === undefined && Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'invalid' }
  }
  if (!isOrdinaryJsonObject(raw) || hasHostileOwnShape(raw)) {
    return { kind: 'invalid' }
  }
  const keys = Object.keys(raw)
  for (const key of keys) {
    if (key !== 'minAge' && key !== 'maxAge') {
      return { kind: 'invalid' }
    }
  }
  const value: { minAge?: number; maxAge?: number } = {}
  if (Object.prototype.hasOwnProperty.call(raw, 'minAge')) {
    const minAge = readOwnDataProperty(raw, 'minAge')
    if (!isNonnegativeSafeInteger(minAge)) {
      return { kind: 'invalid' }
    }
    value.minAge = minAge
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'maxAge')) {
    const maxAge = readOwnDataProperty(raw, 'maxAge')
    if (!isNonnegativeSafeInteger(maxAge)) {
      return { kind: 'invalid' }
    }
    value.maxAge = maxAge
  }
  if (value.minAge !== undefined && value.maxAge !== undefined && value.minAge > value.maxAge) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', value }
}

function admitStringMember(
  properties: Record<string, unknown>,
  key: string,
  options: Readonly<{ minLengthAtLeastOne: boolean; exactPattern?: string }>,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(properties, key)) {
    return false
  }
  const member = readOwnDataProperty(properties, key)
  if (!isOrdinaryJsonObject(member) || hasHostileOwnShape(member)) {
    return false
  }
  if (readOwnDataProperty(member, 'type') !== 'string') {
    return false
  }
  if (options.minLengthAtLeastOne) {
    if (!isIntegerAtLeastOne(readOwnDataProperty(member, 'minLength'))) {
      return false
    }
  }
  if (options.exactPattern !== undefined) {
    if (readOwnDataProperty(member, 'pattern') !== options.exactPattern) {
      return false
    }
  }
  return true
}

/** Email field schema: type string, format email, admitted x-dg20. */
export function isAdmittedEmailSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'string') {
    return false
  }
  if (readOwnDataProperty(schema, 'format') !== 'email') {
    return false
  }
  return admitEmailXDg20(schema).kind !== 'invalid'
}

/** DOB field schema: type string, format date, admitted x-dg20. */
export function isAdmittedDobSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'string') {
    return false
  }
  if (readOwnDataProperty(schema, 'format') !== 'date') {
    return false
  }
  return admitDobXDg20(schema).kind !== 'invalid'
}

/** Full-name object schema with baked EN/GU invariants. */
export function isAdmittedFullNameSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (!isOrdinaryJsonObject(propertiesRaw) || hasHostileOwnShape(propertiesRaw)) {
    return false
  }
  if (!hasExactPropertyMembers(propertiesRaw, ['en', 'gu'])) {
    return false
  }
  if (!admitStringMember(propertiesRaw, 'en', { minLengthAtLeastOne: true })) {
    return false
  }
  if (!admitStringMember(propertiesRaw, 'gu', { minLengthAtLeastOne: true })) {
    return false
  }
  return admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), ['en', 'gu'])
}

/** Pincode object schema with baked PIN / city / district invariants. */
export function isAdmittedPincodeSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (!isOrdinaryJsonObject(propertiesRaw) || hasHostileOwnShape(propertiesRaw)) {
    return false
  }
  if (!hasExactPropertyMembers(propertiesRaw, ['pincode', 'cityCode', 'districtCode'])) {
    return false
  }
  if (
    !admitStringMember(propertiesRaw, 'pincode', {
      minLengthAtLeastOne: false,
      exactPattern: '^[0-9]{6}$',
    })
  ) {
    return false
  }
  if (!admitStringMember(propertiesRaw, 'cityCode', { minLengthAtLeastOne: true })) {
    return false
  }
  if (!admitStringMember(propertiesRaw, 'districtCode', { minLengthAtLeastOne: true })) {
    return false
  }
  return admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), ['pincode'])
}

function schemaRejectsXDg20(schema: Record<string, unknown>): boolean {
  return !Object.prototype.hasOwnProperty.call(schema, 'x-dg20')
}

function admitBooleanMember(properties: Record<string, unknown>, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(properties, key)) {
    return false
  }
  const member = readOwnDataProperty(properties, key)
  if (!isOrdinaryJsonObject(member) || hasHostileOwnShape(member)) {
    return false
  }
  return readOwnDataProperty(member, 'type') === 'boolean'
}

function admitExactStringEnumMember(
  properties: Record<string, unknown>,
  key: string,
  expectedEnum: readonly string[],
): boolean {
  if (!Object.prototype.hasOwnProperty.call(properties, key)) {
    return false
  }
  const member = readOwnDataProperty(properties, key)
  if (!isOrdinaryJsonObject(member) || hasHostileOwnShape(member)) {
    return false
  }
  if (readOwnDataProperty(member, 'type') !== 'string') {
    return false
  }
  return admitExactRequiredMembers(readOwnDataProperty(member, 'enum'), expectedEnum)
}

/**
 * Admit mobile-otp `x-dg20`: absent, or exact `{ otpChannels: ["sms"] }`.
 */
export function admitMobileOtpXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<{ readonly otpChannels: readonly ['sms'] }> {
  if (!Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'absent' }
  }
  const raw = readOwnDataProperty(schema as object, 'x-dg20')
  if (raw === undefined && Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'invalid' }
  }
  if (!isOrdinaryJsonObject(raw) || hasHostileOwnShape(raw)) {
    return { kind: 'invalid' }
  }
  const keys = Object.keys(raw)
  if (keys.length !== 1 || keys[0] !== 'otpChannels') {
    return { kind: 'invalid' }
  }
  const channels = readOwnDataProperty(raw, 'otpChannels')
  if (!admitExactRequiredMembers(channels, ['sms'])) {
    return { kind: 'invalid' }
  }
  // admitExactRequiredMembers checks membership set; also require dense length-1 ["sms"].
  if (!Array.isArray(channels) || channels.length !== 1) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', value: { otpChannels: ['sms'] } }
}

/** Aadhaar object schema — reference token surface only; no x-dg20. */
export function isAdmittedAadhaarSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  if (!schemaRejectsXDg20(schema)) {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (!isOrdinaryJsonObject(propertiesRaw) || hasHostileOwnShape(propertiesRaw)) {
    return false
  }
  if (!hasExactPropertyMembers(propertiesRaw, ['referenceToken', 'identifierKind', 'lastFour'])) {
    return false
  }
  if (!admitStringMember(propertiesRaw, 'referenceToken', { minLengthAtLeastOne: true })) {
    return false
  }
  if (!admitExactStringEnumMember(propertiesRaw, 'identifierKind', ['AADHAAR', 'VID'])) {
    return false
  }
  if (
    !admitStringMember(propertiesRaw, 'lastFour', {
      minLengthAtLeastOne: false,
      exactPattern: '^[0-9]{4}$',
    })
  ) {
    return false
  }
  return admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), [
    'referenceToken',
    'identifierKind',
    'lastFour',
  ])
}

/** Mobile OTP object schema with optional exact SMS channel extension. */
export function isAdmittedMobileOtpSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (!isOrdinaryJsonObject(propertiesRaw) || hasHostileOwnShape(propertiesRaw)) {
    return false
  }
  if (!hasExactPropertyMembers(propertiesRaw, ['mobileNumber', 'verified', 'verificationRef'])) {
    return false
  }
  if (
    !admitStringMember(propertiesRaw, 'mobileNumber', {
      minLengthAtLeastOne: false,
      exactPattern: '^[0-9]{10}$',
    })
  ) {
    return false
  }
  if (!admitBooleanMember(propertiesRaw, 'verified')) {
    return false
  }
  if (!admitStringMember(propertiesRaw, 'verificationRef', { minLengthAtLeastOne: true })) {
    return false
  }
  if (
    !admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), [
      'mobileNumber',
      'verified',
    ])
  ) {
    return false
  }
  return admitMobileOtpXDg20(schema).kind !== 'invalid'
}

/** Bank account object schema — no x-dg20 business configuration. */
export function isAdmittedBankAccountSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  if (!schemaRejectsXDg20(schema)) {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (!isOrdinaryJsonObject(propertiesRaw) || hasHostileOwnShape(propertiesRaw)) {
    return false
  }
  if (
    !hasExactPropertyMembers(propertiesRaw, [
      'accountNumber',
      'ifsc',
      'accountHolderName',
      'verified',
      'verificationRef',
    ])
  ) {
    return false
  }
  if (
    !admitStringMember(propertiesRaw, 'accountNumber', {
      minLengthAtLeastOne: false,
      exactPattern: '^[0-9]{6,20}$',
    })
  ) {
    return false
  }
  if (
    !admitStringMember(propertiesRaw, 'ifsc', {
      minLengthAtLeastOne: false,
      exactPattern: '^[A-Z]{4}0[A-Z0-9]{6}$',
    })
  ) {
    return false
  }
  if (!admitStringMember(propertiesRaw, 'accountHolderName', { minLengthAtLeastOne: true })) {
    return false
  }
  if (!admitBooleanMember(propertiesRaw, 'verified')) {
    return false
  }
  if (!admitStringMember(propertiesRaw, 'verificationRef', { minLengthAtLeastOne: true })) {
    return false
  }
  return admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), ['verified'])
}

export type CitizenWidgetType =
  'email' | 'full-name' | 'dob' | 'pincode' | 'aadhaar' | 'mobile-otp' | 'bank-account'

export function isCitizenWidgetType(widgetType: string): widgetType is CitizenWidgetType {
  return (
    widgetType === 'email' ||
    widgetType === 'full-name' ||
    widgetType === 'dob' ||
    widgetType === 'pincode' ||
    widgetType === 'aadhaar' ||
    widgetType === 'mobile-otp' ||
    widgetType === 'bank-account'
  )
}

/** True when the field schema satisfies the governed citizen invariants for widgetType. */
export function isAdmittedCitizenSchema(widgetType: CitizenWidgetType, schema: unknown): boolean {
  switch (widgetType) {
    case 'email':
      return isAdmittedEmailSchema(schema)
    case 'dob':
      return isAdmittedDobSchema(schema)
    case 'full-name':
      return isAdmittedFullNameSchema(schema)
    case 'pincode':
      return isAdmittedPincodeSchema(schema)
    case 'aadhaar':
      return isAdmittedAadhaarSchema(schema)
    case 'mobile-otp':
      return isAdmittedMobileOtpSchema(schema)
    case 'bank-account':
      return isAdmittedBankAccountSchema(schema)
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      return false
    }
  }
}

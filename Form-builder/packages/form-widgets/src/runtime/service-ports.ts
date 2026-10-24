/**
 * Optional runtime service ports for widgets.
 * Adapters must never perform HTTP inside this package — hosts inject fakes or
 * Integration Hub wrappers. Results must not be stored in FormDefinition.
 */

export interface EmailVerificationRequest {
  readonly fieldId: string
  readonly email: string
  readonly signal: AbortSignal
}

export interface EmailVerificationResult {
  /** Opaque correlation id from the host adapter; never stored in form data. */
  readonly requestId?: string
}

export interface EmailVerificationAdapter {
  requestVerificationLink(input: EmailVerificationRequest): Promise<EmailVerificationResult>
}

export interface NameTransliterationRequest {
  readonly fieldId: string
  readonly englishName: string
  readonly signal: AbortSignal
}

export interface NameTransliterationResult {
  readonly gujaratiSuggested: string
}

export interface NameTransliterationAdapter {
  transliterateEnglishToGujarati(
    input: NameTransliterationRequest,
  ): Promise<NameTransliterationResult>
}

/** Calendar “today” as YYYY-MM-DD in the host’s local civil calendar. */
export interface WidgetClock {
  todayIso(): string
}

/** Browser-safe default clock using local date components (not UTC Date parsing). */
export function createBrowserWidgetClock(): WidgetClock {
  return {
    todayIso(): string {
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    },
  }
}

export type AadhaarIdentifierKind = 'AADHAAR' | 'VID'

export interface IdentityTokenizationRequest {
  readonly fieldId: string
  readonly identifierKind: AadhaarIdentifierKind
  readonly rawIdentifier: string
  readonly signal: AbortSignal
}

export interface IdentityTokenizationResult {
  readonly referenceToken: string
  readonly lastFour: string
}

export interface IdentityTokenizationAdapter {
  tokenizeIdentity(input: IdentityTokenizationRequest): Promise<IdentityTokenizationResult>
}

/**
 * Governed OTP delivery channel for FB-A3.
 * Additional channels require a governed contract change — do not invent them.
 */
export type OtpChannel = 'sms'

export interface SendMobileOtpRequest {
  readonly fieldId: string
  readonly mobileNumber: string
  readonly channels: readonly OtpChannel[]
  readonly signal: AbortSignal
}

export interface SendMobileOtpResult {
  readonly challengeId: string
  readonly otpLength: number
}

export interface VerifyMobileOtpRequest {
  readonly fieldId: string
  readonly mobileNumber: string
  readonly challengeId: string
  readonly otp: string
  readonly signal: AbortSignal
}

export interface VerifyMobileOtpResult {
  readonly verificationRef: string
}

export interface MobileOtpAdapter {
  sendOtp(input: SendMobileOtpRequest): Promise<SendMobileOtpResult>
  verifyOtp(input: VerifyMobileOtpRequest): Promise<VerifyMobileOtpResult>
}

/** Governed OTP length accepted from host adapters (FB-A3). */
export const OTP_LENGTH_MIN = 4
export const OTP_LENGTH_MAX = 8

export function isGovernedOtpLength(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= OTP_LENGTH_MIN &&
    value <= OTP_LENGTH_MAX
  )
}

export interface WidgetServicePorts {
  readonly emailVerification?: EmailVerificationAdapter
  readonly nameTransliteration?: NameTransliterationAdapter
  readonly clock?: WidgetClock
  readonly identityTokenization?: IdentityTokenizationAdapter
  readonly mobileOtp?: MobileOtpAdapter
  readonly cafPrefill?: CafPrefillAdapter
  readonly geography?: GeographyAdapter
  readonly pincodeLookup?: PincodeLookupAdapter
  readonly fileStorage?: FileStorageAdapter
  readonly digiLocker?: DigiLockerAdapter
  readonly masterData?: MasterDataAdapter
  readonly bankAccountVerification?: BankAccountVerificationAdapter
  readonly consentLogging?: ConsentLoggingAdapter
  readonly feeComputation?: FeeComputationAdapter
  readonly eSign?: ESignAdapter
}

export interface CafPrefillRequest {
  readonly fieldId: string
  readonly cafAttribute: string
  readonly signal: AbortSignal
}

export type CafPrefillResolveResult =
  { readonly value: string; readonly confidence: number } | { readonly found: false }

export interface CafPrefillAdapter {
  resolvePrefill(input: CafPrefillRequest): Promise<CafPrefillResolveResult>
}

export type GeographyLevel = 'state' | 'district' | 'taluka' | 'village'

export interface MasterDataOption {
  readonly code: string
  readonly labelEn: string
  readonly labelGu: string
}

export interface GeographyParentCodes {
  readonly stateCode?: string
  readonly districtCode?: string
  readonly talukaCode?: string
}

export interface GeographyRequest {
  readonly fieldId: string
  readonly level: GeographyLevel
  readonly parentCodes: GeographyParentCodes
  readonly signal: AbortSignal
}

export interface GeographyAdapter {
  listOptions(request: GeographyRequest): Promise<readonly MasterDataOption[]>
}

/** Host-injected master-data list lookup (never HTTP inside this package). */
export interface MasterDataRequest {
  readonly fieldId: string
  readonly masterListId: string
  readonly signal: AbortSignal
  /** Present only for cascading child (and similar dependent) list requests. */
  readonly parentCode?: string
}

export interface MasterDataAdapter {
  listOptions(request: MasterDataRequest): Promise<readonly MasterDataOption[]>
}

export interface PincodeLookupRequest {
  readonly fieldId: string
  readonly pincode: string
  readonly signal: AbortSignal
}

export type PincodeLookupResult =
  | {
      readonly found: true
      readonly cityCode: string
      readonly districtCode: string
      readonly cityLabelEn: string
      readonly cityLabelGu: string
      readonly districtLabelEn: string
      readonly districtLabelGu: string
    }
  | { readonly found: false }

export interface PincodeLookupAdapter {
  lookupPincode(request: PincodeLookupRequest): Promise<PincodeLookupResult>
}

/** Host-injected secure file storage (never HTTP inside this package). */
export type FileStoragePurpose = 'DOCUMENT' | 'PHOTO'

export interface FileStorageRequest {
  readonly fieldId: string
  readonly purpose: FileStoragePurpose
  readonly file: File
  readonly signal: AbortSignal
}

export type FileStorageResult =
  | {
      readonly status: 'CLEAN'
      readonly objectRef: string
      readonly mimeType: string
      readonly sizeBytes: number
      readonly width?: number
      readonly height?: number
    }
  | { readonly status: 'REJECTED' }

export interface FileStorageAdapter {
  storeFile(request: FileStorageRequest): Promise<FileStorageResult>
}

/** Host-injected DigiLocker issued-document fetch (never OAuth/HTTP here). */
export interface DigiLockerFetchRequest {
  readonly fieldId: string
  readonly documentTypeCode: string
  readonly signal: AbortSignal
}

export interface DigiLockerFetchResult {
  readonly issuerSignedRef: string
  readonly documentTypeCode: string
}

export interface DigiLockerAdapter {
  fetchIssuedDocument(request: DigiLockerFetchRequest): Promise<DigiLockerFetchResult>
}

/** Host-injected bank account-name verification (never HTTP inside this package). */
export interface BankAccountVerificationRequest {
  readonly fieldId: string
  readonly accountNumber: string
  readonly ifsc: string
  readonly accountHolderName: string
  readonly signal: AbortSignal
}

export type BankAccountVerificationResult =
  { readonly verified: true; readonly verificationRef: string } | { readonly verified: false }

export interface BankAccountVerificationAdapter {
  verifyAccountName(request: BankAccountVerificationRequest): Promise<BankAccountVerificationResult>
}

/** Host-injected consent ledger write (never HTTP / Date proof inside this package). */
export interface ConsentLoggingRequest {
  readonly fieldId: string
  readonly declarationId: string
  readonly accepted: boolean
  readonly locale: 'en' | 'gu'
  readonly signal: AbortSignal
}

export interface ConsentLoggingResult {
  readonly declarationId: string
  readonly accepted: boolean
  readonly locale: 'en' | 'gu'
  readonly consentReceiptRef: string
}

export interface ConsentLoggingAdapter {
  recordDecision(request: ConsentLoggingRequest): Promise<ConsentLoggingResult>
}

/** Host-injected fee-engine quote (never HTTP inside this package). */
export interface FeeComputationRequest {
  readonly fieldId: string
  readonly feeRuleId: string
  readonly contextRevision: string
  readonly signal: AbortSignal
}

export interface FeeComputationResult {
  readonly feeRuleId: string
  readonly contextRevision: string
  readonly currency: 'INR'
  readonly amountMinor: number
  readonly quoteRef: string
}

export interface FeeComputationAdapter {
  computeFee(request: FeeComputationRequest): Promise<FeeComputationResult>
}

/** Host-injected eSign flow (never HTTP / popup / SDK inside this package). */
export interface ESignRequest {
  readonly fieldId: string
  readonly contextRevision: string
  readonly locale: 'en' | 'gu'
  readonly signal: AbortSignal
}

export type ESignResult =
  | {
      readonly status: 'SIGNED'
      readonly contextRevision: string
      readonly signedArtefactRef: string
    }
  | {
      readonly status: 'CANCELLED'
      readonly contextRevision: string
    }

export interface ESignAdapter {
  requestSignature(request: ESignRequest): Promise<ESignResult>
}

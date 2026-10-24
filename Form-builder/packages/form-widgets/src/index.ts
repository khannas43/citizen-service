export type {
  PaletteGroupId,
  WidgetCategory,
  WidgetImplementationStatus,
  PaletteGroupDefinition,
  PaletteWidgetDefinition,
} from './palette-types.js'

export { PALETTE_GROUP_IDS } from './palette-types.js'

export {
  PALETTE_GROUPS,
  PALETTE_REGISTRY,
  PALETTE_BY_TYPE,
  PALETTE_WIDGET_COUNT,
  buildPaletteRegistry,
  getPaletteWidget,
  getPaletteGroup,
  listWidgetsByGroup,
  isApprovedWidgetType,
} from './palette-registry.js'

export type { WidgetLocale, BilingualKind, LocalizedResolution } from './runtime/localized-text.js'
export { resolveLocalizedText, htmlLangForLocale } from './runtime/localized-text.js'

export type {
  FieldIdentity,
  FieldIdResolver,
  FieldIdResolverInput,
  FieldIdResolverResult,
} from './runtime/field-id.js'
export {
  appendArrayIndex,
  appendArrayIndexToResolvedPath,
  appendArrayTemplate,
  appendArrayTemplateToResolvedPath,
  appendProperty,
  defaultFieldIdResolver,
  escapeFieldPathSegment,
  joinFieldPath,
  normalizeFieldIdResolverResult,
  resolveCanonicalFieldId,
  resolveFieldIdentity,
} from './runtime/field-id.js'

export type {
  NestedFieldIdentityScopeProps,
  NestedFieldIdentityScopeValue,
} from './runtime/nested-field-identity.js'
export {
  NestedFieldIdentityScope,
  useNestedFieldIdentityScope,
} from './runtime/nested-field-identity.js'

export { resolveFieldErrorMessages } from './runtime/error-resolution.js'

export type { Dg20SchemaExtensions } from './runtime/x-dg20.js'
export { parseDg20Extensions, resolveOtpChannels } from './runtime/x-dg20.js'

export type {
  WidgetMessageKey,
  WidgetMessageOverrides,
  WidgetMessageParams,
} from './runtime/messages.js'
export {
  WIDGET_MESSAGE_KEYS,
  resolveWidgetMessage,
  getDefaultWidgetMessageCatalogue,
} from './runtime/messages.js'

export type {
  EmailVerificationAdapter,
  EmailVerificationRequest,
  EmailVerificationResult,
  NameTransliterationAdapter,
  NameTransliterationRequest,
  NameTransliterationResult,
  WidgetClock,
  WidgetServicePorts,
  AadhaarIdentifierKind,
  IdentityTokenizationAdapter,
  IdentityTokenizationRequest,
  IdentityTokenizationResult,
  OtpChannel,
  MobileOtpAdapter,
  SendMobileOtpRequest,
  SendMobileOtpResult,
  VerifyMobileOtpRequest,
  VerifyMobileOtpResult,
  CafPrefillAdapter,
  CafPrefillRequest,
  CafPrefillResolveResult,
  GeographyLevel,
  MasterDataOption,
  GeographyParentCodes,
  GeographyRequest,
  GeographyAdapter,
  PincodeLookupRequest,
  PincodeLookupResult,
  PincodeLookupAdapter,
  FileStoragePurpose,
  FileStorageRequest,
  FileStorageResult,
  FileStorageAdapter,
  DigiLockerFetchRequest,
  DigiLockerFetchResult,
  DigiLockerAdapter,
  MasterDataRequest,
  MasterDataAdapter,
  BankAccountVerificationRequest,
  BankAccountVerificationResult,
  BankAccountVerificationAdapter,
  ConsentLoggingRequest,
  ConsentLoggingResult,
  ConsentLoggingAdapter,
  FeeComputationRequest,
  FeeComputationResult,
  FeeComputationAdapter,
  ESignRequest,
  ESignResult,
  ESignAdapter,
} from './runtime/service-ports.js'
export {
  createBrowserWidgetClock,
  isGovernedOtpLength,
  OTP_LENGTH_MIN,
  OTP_LENGTH_MAX,
} from './runtime/service-ports.js'

export { isValidVerhoeff } from './runtime/verhoeff.js'
export {
  normalizeIdentityPaste,
  tryNormalizeDigitRun,
  inferAadhaarIdentifierKind,
  isValidAadhaarOrVid,
  lastFourDigits,
  formatAadhaarMask,
  isSafeIdentityTokenizationResult,
} from './runtime/aadhaar-identifier.js'
export {
  isSafeOpaqueReference,
  isSafeChallengeId,
  isSafeVerificationRef,
} from './runtime/opaque-reference.js'
export {
  BANK_ACCOUNT_NUMBER_MIN_DIGITS,
  BANK_ACCOUNT_NUMBER_MAX_DIGITS,
  BANK_IFSC_PATTERN,
  parseBankAccountNumberInput,
  isValidBankAccountNumberDigits,
  normalizeBankIfscInput,
  isValidBankIfsc,
  isNonBlankAccountHolderName,
  formatBankAccountMask,
  isSafeBankVerificationRef,
  acceptBankVerificationResult,
  assessBankAccountIncomingValue,
  emitBankAccountValue,
} from './runtime/bank-account.js'
export type {
  BankAccountIncomingAssessment,
  BankVerificationAdapterResult,
} from './runtime/bank-account.js'

export {
  resolveDeclarationId,
  isWidgetLocale,
  isSafeConsentReceiptRef,
  acceptConsentLoggingResult,
  assessEligibilityDeclarationIncomingValue,
  emitEligibilityDeclarationValue,
} from './runtime/eligibility-declaration.js'
export type { EligibilityDeclarationIncomingAssessment } from './runtime/eligibility-declaration.js'

export {
  resolveFeeRuleId,
  resolveFeeContextRevision,
  isValidFeeAmountMinor,
  isSafeFeeQuoteRef,
  acceptFeeComputationResult,
  assessFeeFieldIncomingValue,
  emitFeeFieldValue,
  formatFeeAmountInr,
} from './runtime/fee-field.js'
export type { FeeFieldIncomingAssessment } from './runtime/fee-field.js'

export {
  resolveESignContextRevision,
  isSafeSignedArtefactRef,
  acceptESignResult,
  assessSignatureESignIncomingValue,
  emitSignatureESignValue,
} from './runtime/signature-esign.js'
export type { SignatureESignIncomingAssessment } from './runtime/signature-esign.js'

export {
  FAMILY_REPEATER_GLOBAL_MAX_ROWS,
  resolveFamilyRepeaterConfig,
  assessFamilyRepeaterIncomingValue,
  emitFamilyRepeaterValue,
  createFamilyRepeaterRowKey,
  reconcileFamilyRepeaterRowKeys,
  regenerateFamilyRepeaterRowKeys,
  buildFamilyRepeaterItemIdentity,
} from './runtime/family-repeater.js'
export type {
  FamilyRepeaterConfigFailureReason,
  FamilyRepeaterConfigResolution,
  FamilyRepeaterIncomingAssessment,
} from './runtime/family-repeater.js'

export {
  validateMasterDataOptions,
  resolveMasterListId,
  masterDataOptionLabel,
  isKnownMasterDataCode,
  assessMasterChoiceIncomingValue,
  shouldShowMasterChoiceInvalidValue,
  resolveMasterChoiceSelectedCode,
  resolveMultiselectItemBounds,
  assessMultiselectIncomingValue,
  shouldShowMultiselectInvalidValue,
  resolveMultiselectSelectedCodes,
  orderCodesByOptions,
  emitMultiselectCodes,
  resolveCascadingListIds,
  assessCascadingIncomingValue,
  isSafePincodeLookupFound,
} from './runtime/master-data.js'
export {
  resolvePrefillBindingForField,
  isValidConfidenceUnit,
  isNonBlankPrefillValue,
  acceptCafPrefillResult,
} from './runtime/prefill-bindings.js'
export {
  DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES,
  PHOTO_CAPTURE_ALLOWED_MIME_TYPES,
  PHOTO_CAPTURE_MAX_BYTES,
  PHOTO_CAPTURE_MIN_DIMENSION,
  PHOTO_CAPTURE_MAX_DIMENSION,
  isSafeObjectStoreRef,
  resolveDocumentUploadConfig,
  documentUploadConfigFingerprint,
  precheckFileAgainstPolicy,
  acceptCleanFileStorageResult,
  resolveDigiLockerDocumentTypeCode,
  acceptDigiLockerFetchResult,
  parseStoredDocumentReference,
  parseStoredPhotoReference,
  parseStoredDigiLockerValue,
} from './runtime/file-storage.js'

export type { CivilDate } from './runtime/civil-date.js'
export {
  parseIsoDate,
  formatIsoDate,
  compareCivil,
  nextCivilDay,
  completedAgeYears,
  anniversaryInYear,
  subtractYearsForCutoff,
  subtractYears,
  latestDobForMinAge,
  earliestDobForMaxAge,
  isLeapYear,
  isAgeWithinGate,
} from './runtime/civil-date.js'

export type { WidgetRuntimeContextValue } from './runtime/widget-types.js'
export { DEFAULT_BILINGUAL, DEFAULT_WIDGET_RUNTIME } from './runtime/widget-types.js'

export { WidgetRuntimeProvider, useWidgetRuntime } from './runtime/widget-context.js'
export type { WidgetRuntimeProviderProps } from './runtime/widget-context.js'

export type { Dg20WidgetProps, Dg20FieldProps } from './runtime/widget-helpers.js'

export {
  dg20Widgets,
  dg20Fields,
  IMPLEMENTED_WIDGET_TYPES,
  TextShortWidget,
  TextLongWidget,
  NumberWidget,
  CurrencyInrWidget,
  PercentageWidget,
  EmailWidget,
  FullNameWidget,
  DobWidget,
  GenderWidget,
  AadhaarWidget,
  MobileOtpWidget,
  CafPrefillWidget,
  AddressBlockWidget,
  PincodeWidget,
  DocumentUploadWidget,
  DigiLockerFetchWidget,
  PhotoCaptureWidget,
  DropdownMasterWidget,
  RadioMasterWidget,
  YesNoWidget,
  MultiselectWidget,
  CascadingDropdownWidget,
  BankAccountWidget,
  EligibilityDeclarationWidget,
  FeeFieldWidget,
  SignatureESignWidget,
  FamilyRepeaterWidget,
  SectionHeaderField,
  InfoPanelField,
  PageBreakField,
  GENDER_CODES,
  isGenderCode,
  isYesNoBoolean,
} from './widgets/registry.js'
export type {
  ImplementedWidgetType,
  FullNameValue,
  GenderCode,
  AadhaarReferenceValue,
  MobileOtpValue,
  CafPrefillValue,
  CafPrefillSource,
  AddressBlockValue,
  PincodeValue,
  DocumentReferenceValue,
  DigiLockerDocumentValue,
  PhotoReferenceValue,
  CascadingDropdownValue,
  BankAccountValue,
  EligibilityDeclarationValue,
  FeeFieldValue,
  SignatureESignValue,
} from './widgets/registry.js'

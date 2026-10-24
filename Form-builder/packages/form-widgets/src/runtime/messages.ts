import type { LocalizedValue } from '@dg20/form-contract'

import type { WidgetLocale } from './localized-text.js'

/**
 * Governed widget-owned chrome messages (not form-specific bilingual metadata).
 * Parameter tokens use `{name}` placeholders; only provided params are substituted.
 */

export const WIDGET_MESSAGE_KEYS = [
  'charactersRemaining',
  'amountInInr',
  'percentage',
  'sendVerificationLink',
  'verificationLinkSent',
  'verificationSending',
  'verificationUnavailable',
  'transliterateToGujarati',
  'transliterationInProgress',
  'applyTransliteration',
  'dismissSuggestion',
  'fullNameEnglish',
  'fullNameGujarati',
  'derivedAge',
  'genderMale',
  'genderFemale',
  'genderOther',
  'adapterUnavailable',
  'retry',
  'operationFailed',
  'infoPanelDefaultTitle',
  'ageConfigInvalid',
  'ageGateViolation',
  'futureDob',
  'stepBoundaryFallback',
  'aadhaarSecureTokenize',
  'aadhaarTokenizing',
  'aadhaarTokenizationUnavailable',
  'aadhaarInvalidIdentifier',
  'aadhaarReplace',
  'aadhaarMaskedLabel',
  'aadhaarTokenizationFailedReenter',
  'mobileSendOtp',
  'mobileResendOtp',
  'mobileVerifyOtp',
  'mobileOtpSending',
  'mobileOtpSent',
  'mobileOtpVerifying',
  'mobileOtpVerified',
  'mobileOtpUnavailable',
  'mobileInvalidNumber',
  'mobileOtpInvalidLength',
  'mobileOtpInvalidCharacters',
  'mobileMaskedLabel',
  'mobileUnverifiedStatus',
  'otpChannelsInvalid',
  'cafPrefillIndicator',
  'cafPrefillEdit',
  'cafPrefillManualHint',
  'cafPrefillUnavailable',
  'cafPrefillBindingInvalid',
  'cafPrefillLoading',
  'addressState',
  'addressDistrict',
  'addressTaluka',
  'addressVillage',
  'addressLoading',
  'addressEmpty',
  'addressUnavailable',
  'addressLoadFailed',
  'addressSelectPlaceholder',
  'pincodeInvalid',
  'pincodeLookingUp',
  'pincodeNotFound',
  'pincodeEnrichmentUnavailable',
  'pincodeCity',
  'pincodeDistrict',
  'docUploadAction',
  'docUploading',
  'docUploadReady',
  'docUploadUnavailable',
  'docUploadConfigInvalid',
  'docUploadRejected',
  'docUploadMimeRejected',
  'docUploadSizeRejected',
  'docUploadedLabel',
  'docReplaceRemove',
  'digiLockerFetchAction',
  'digiLockerFetching',
  'digiLockerUnavailable',
  'digiLockerConfigInvalid',
  'digiLockerFetchedLabel',
  'digiLockerReplaceRemove',
  'photoUploadAction',
  'photoUploading',
  'photoCaptureReady',
  'photoCaptureUnavailable',
  'photoCaptureRejected',
  'photoMimeRejected',
  'photoSizeRejected',
  'photoCapturedLabel',
  'photoReplaceRemove',
  'masterDataLoading',
  'masterDataEmpty',
  'masterDataUnavailable',
  'masterDataLoadFailed',
  'masterDataConfigInvalid',
  'masterDataSelectPlaceholder',
  'masterDataUnknownValue',
  'yesNoYes',
  'yesNoNo',
  'yesNoInvalidValue',
  'multiselectConfigInvalid',
  'multiselectInvalidValue',
  'multiselectBelowMinimum',
  'cascadingConfigInvalid',
  'cascadingInvalidValue',
  'cascadingParentLabel',
  'cascadingChildLabel',
  'cascadingSelectParentFirst',
  'bankAccountNumberLabel',
  'bankIfscLabel',
  'bankAccountHolderLabel',
  'bankVerifyAction',
  'bankVerifying',
  'bankVerified',
  'bankVerificationUnavailable',
  'bankVerificationMismatch',
  'bankVerificationFailed',
  'bankInvalidInput',
  'bankAccountNumberInvalid',
  'bankIfscInvalid',
  'bankInvalidValue',
  'bankAccountNumberUnavailable',
  'declarationAcceptLabel',
  'declarationRecording',
  'declarationRecorded',
  'declarationUnavailable',
  'declarationConfigInvalid',
  'declarationFailed',
  'declarationInvalidValue',
  'feeCalculating',
  'feeComputed',
  'feeComputationUnavailable',
  'feeContextUnavailable',
  'feeConfigInvalid',
  'feeComputationFailed',
  'feeInvalidValue',
  'feeAmountUnavailable',
  'eSignSignAction',
  'eSignReplaceAction',
  'eSignSigning',
  'eSignSigned',
  'eSignUnsigned',
  'eSignStaleStatus',
  'eSignCancelled',
  'eSignCancelledRetained',
  'eSignUnavailable',
  'eSignContextUnavailable',
  'eSignFailed',
  'eSignFailedRetained',
  'eSignInvalidValue',
  'familyRepeaterMemberHeading',
  'familyRepeaterAddAction',
  'familyRepeaterRemoveAction',
  'familyRepeaterConfigInvalid',
  'familyRepeaterInvalidValue',
  'familyRepeaterBelowMinimum',
  'familyRepeaterMaxReached',
] as const

export type WidgetMessageKey = (typeof WIDGET_MESSAGE_KEYS)[number]

export type WidgetMessageOverrides = Partial<Record<WidgetMessageKey, LocalizedValue>>

export type WidgetMessageParams = Readonly<Record<string, string | number>>

const CATALOGUE: Record<WidgetMessageKey, LocalizedValue> = {
  charactersRemaining: {
    en: '{count} characters remaining',
    gu: '{count} અક્ષરો બાકી',
  },
  amountInInr: {
    en: 'Amount in Indian Rupees',
    gu: 'ભારતીય રૂપિયા',
  },
  percentage: {
    en: 'Percentage',
    gu: 'ટકાવારી',
  },
  sendVerificationLink: {
    en: 'Send verification link',
    gu: 'ચકાસણી લિંક મોકલો',
  },
  verificationLinkSent: {
    en: 'Verification link sent. Check your email.',
    gu: 'ચકાસણી લિંક મોકલાઈ. તમારું ઇમેઇલ તપાસો.',
  },
  verificationSending: {
    en: 'Sending verification link…',
    gu: 'ચકાસણી લિંક મોકલાઈ રહી છે…',
  },
  verificationUnavailable: {
    en: 'Email verification is temporarily unavailable.',
    gu: 'ઇમેઇલ ચકાસણી હાલમાં અનુપલબ્ધ છે.',
  },
  transliterateToGujarati: {
    en: 'Transliterate to Gujarati',
    gu: 'ગુજરાતીમાં લિપ્યંતરણ કરો',
  },
  transliterationInProgress: {
    en: 'Transliteration in progress…',
    gu: 'લિપ્યંતરણ ચાલુ છે…',
  },
  applyTransliteration: {
    en: 'Apply suggested Gujarati',
    gu: 'સૂચિત ગુજરાતી લાગુ કરો',
  },
  dismissSuggestion: {
    en: 'Dismiss suggestion',
    gu: 'સૂચન કાઢી નાખો',
  },
  fullNameEnglish: {
    en: 'Name in English',
    gu: 'અંગ્રેજીમાં નામ',
  },
  fullNameGujarati: {
    en: 'Name in Gujarati',
    gu: 'ગુજરાતીમાં નામ',
  },
  derivedAge: {
    en: 'Age: {age} years',
    gu: 'ઉંમર: {age} વર્ષ',
  },
  genderMale: {
    en: 'Male',
    gu: 'પુરુષ',
  },
  genderFemale: {
    en: 'Female',
    gu: 'સ્ત્રી',
  },
  genderOther: {
    en: 'Other',
    gu: 'અન્ય',
  },
  adapterUnavailable: {
    en: 'This service is temporarily unavailable.',
    gu: 'આ સેવા હાલમાં અનુપલબ્ધ છે.',
  },
  retry: {
    en: 'Retry',
    gu: 'ફરી પ્રયાસ કરો',
  },
  operationFailed: {
    en: 'The operation could not be completed. Please try again.',
    gu: 'કામગીરી પૂર્ણ થઈ શકી નહીં. કૃપા કરીને ફરી પ્રયાસ કરો.',
  },
  infoPanelDefaultTitle: {
    en: 'Information',
    gu: 'માહિતી',
  },
  ageConfigInvalid: {
    en: 'This field is temporarily unavailable because its configuration is invalid.',
    gu: 'આ ક્ષેત્રની ગોઠવણી અમાન્ય હોવાથી હાલમાં અનુપલબ્ધ છે.',
  },
  ageGateViolation: {
    en: 'Date of birth is outside the allowed age range.',
    gu: 'જન્મ તારીખ માન્ય ઉંમર મર્યાદાની બહાર છે.',
  },
  futureDob: {
    en: 'Date of birth cannot be in the future.',
    gu: 'જન્મ તારીખ ભવિષ્યની ન હોઈ શકે.',
  },
  stepBoundaryFallback: {
    en: 'Step boundary',
    gu: 'પગલાની સીમા',
  },
  aadhaarSecureTokenize: {
    en: 'Secure and continue',
    gu: 'સુરક્ષિત કરો અને આગળ વધો',
  },
  aadhaarTokenizing: {
    en: 'Securing your identifier…',
    gu: 'તમારો ઓળખકર્તા સુરક્ષિત થઈ રહ્યો છે…',
  },
  aadhaarTokenizationUnavailable: {
    en: 'Secure identity capture is temporarily unavailable.',
    gu: 'સુરક્ષિત ઓળખ કેપ્ચર હાલમાં અનુપલબ્ધ છે.',
  },
  aadhaarInvalidIdentifier: {
    en: 'Enter a valid 12-digit Aadhaar or 16-digit VID.',
    gu: 'માન્ય 12-અંકીય આધાર અથવા 16-અંકીય VID દાખલ કરો.',
  },
  aadhaarReplace: {
    en: 'Replace identifier',
    gu: 'ઓળખકર્તા બદલો',
  },
  aadhaarMaskedLabel: {
    en: 'Secured identifier',
    gu: 'સુરક્ષિત ઓળખકર્તા',
  },
  aadhaarTokenizationFailedReenter: {
    en: 'Securing your identifier failed. Please re-enter it and try again.',
    gu: 'તમારો ઓળખકર્તા સુરક્ષિત કરવામાં નિષ્ફળ. કૃપા કરીને ફરી દાખલ કરો અને પ્રયાસ કરો.',
  },
  mobileSendOtp: {
    en: 'Send OTP',
    gu: 'OTP મોકલો',
  },
  mobileResendOtp: {
    en: 'Resend OTP',
    gu: 'OTP ફરી મોકલો',
  },
  mobileVerifyOtp: {
    en: 'Verify OTP',
    gu: 'OTP ચકાસો',
  },
  mobileOtpSending: {
    en: 'Sending OTP…',
    gu: 'OTP મોકલાઈ રહ્યો છે…',
  },
  mobileOtpSent: {
    en: 'OTP sent to {maskedMobile}. Enter the code to verify.',
    gu: '{maskedMobile} પર OTP મોકલાયો. ચકાસવા માટે કોડ દાખલ કરો.',
  },
  mobileOtpVerifying: {
    en: 'Verifying OTP…',
    gu: 'OTP ચકાસાઈ રહ્યો છે…',
  },
  mobileOtpVerified: {
    en: 'Mobile number verified',
    gu: 'મોબાઇલ નંબર ચકાસાયો',
  },
  mobileOtpUnavailable: {
    en: 'OTP verification is temporarily unavailable. You can still enter a mobile number.',
    gu: 'OTP ચકાસણી હાલમાં અનુપલબ્ધ છે. તમે હજુ મોબાઇલ નંબર દાખલ કરી શકો છો.',
  },
  mobileInvalidNumber: {
    en: 'Enter a 10-digit mobile number.',
    gu: '10-અંકીય મોબાઇલ નંબર દાખલ કરો.',
  },
  mobileOtpInvalidLength: {
    en: 'Enter the {length}-digit OTP.',
    gu: '{length}-અંકીય OTP દાખલ કરો.',
  },
  mobileOtpInvalidCharacters: {
    en: 'OTP may contain digits only.',
    gu: 'OTPમાં માત્ર અંકો હોઈ શકે.',
  },
  mobileMaskedLabel: {
    en: 'Mobile',
    gu: 'મોબાઇલ',
  },
  mobileUnverifiedStatus: {
    en: 'Not verified',
    gu: 'ચકાસાયેલ નથી',
  },
  otpChannelsInvalid: {
    en: 'This field is temporarily unavailable because its configuration is invalid.',
    gu: 'આ ક્ષેત્રની ગોઠવણી અમાન્ય હોવાથી હાલમાં અનુપલબ્ધ છે.',
  },
  cafPrefillIndicator: {
    en: 'Pre-filled from citizen records',
    gu: 'નાગરિક રેકોર્ડમાંથી પૂર્વ-ભરેલું',
  },
  cafPrefillEdit: {
    en: 'Edit',
    gu: 'સંપાદિત કરો',
  },
  cafPrefillManualHint: {
    en: 'Enter this value manually.',
    gu: 'આ મૂલ્ય જાતે દાખલ કરો.',
  },
  cafPrefillUnavailable: {
    en: 'Automatic pre-fill is temporarily unavailable. You can enter the value manually.',
    gu: 'સ્વયંસંચાલિત પૂર્વ-ભરણ હાલમાં અનુપલબ્ધ છે. તમે મૂલ્ય જાતે દાખલ કરી શકો છો.',
  },
  cafPrefillBindingInvalid: {
    en: 'This field is temporarily unavailable because its configuration is invalid.',
    gu: 'આ ક્ષેત્રની ગોઠવણી અમાન્ય હોવાથી હાલમાં અનુપલબ્ધ છે.',
  },
  cafPrefillLoading: {
    en: 'Loading pre-fill…',
    gu: 'પૂર્વ-ભરણ લોડ થઈ રહ્યું છે…',
  },
  addressState: {
    en: 'State',
    gu: 'રાજ્ય',
  },
  addressDistrict: {
    en: 'District',
    gu: 'જિલ્લો',
  },
  addressTaluka: {
    en: 'Taluka',
    gu: 'તાલુકો',
  },
  addressVillage: {
    en: 'Village',
    gu: 'ગામ',
  },
  addressLoading: {
    en: 'Loading options…',
    gu: 'વિકલ્પો લોડ થઈ રહ્યા છે…',
  },
  addressEmpty: {
    en: 'No options available.',
    gu: 'કોઈ વિકલ્પ ઉપલબ્ધ નથી.',
  },
  addressUnavailable: {
    en: 'Address lookup is temporarily unavailable.',
    gu: 'સરનામાંની શોધ હાલમાં અનુપલબ્ધ છે.',
  },
  addressLoadFailed: {
    en: 'Options could not be loaded. Please try again.',
    gu: 'વિકલ્પો લોડ થઈ શક્યા નહીં. કૃપા કરીને ફરી પ્રયાસ કરો.',
  },
  addressSelectPlaceholder: {
    en: 'Select…',
    gu: 'પસંદ કરો…',
  },
  pincodeInvalid: {
    en: 'Enter a 6-digit PIN code.',
    gu: '6-અંકીય પિન કોડ દાખલ કરો.',
  },
  pincodeLookingUp: {
    en: 'Looking up PIN code…',
    gu: 'પિન કોડ શોધાઈ રહ્યો છે…',
  },
  pincodeNotFound: {
    en: 'No city or district was found for this PIN code.',
    gu: 'આ પિન કોડ માટે શહેર અથવા જિલ્લો મળ્યો નથી.',
  },
  pincodeEnrichmentUnavailable: {
    en: 'PIN enrichment is temporarily unavailable. You can still enter a PIN code.',
    gu: 'પિન સમૃદ્ધિ હાલમાં અનુપલબ્ધ છે. તમે હજુ પિન કોડ દાખલ કરી શકો છો.',
  },
  pincodeCity: {
    en: 'City',
    gu: 'શહેર',
  },
  pincodeDistrict: {
    en: 'District',
    gu: 'જિલ્લો',
  },
  docUploadAction: {
    en: 'Upload',
    gu: 'અપલોડ કરો',
  },
  docUploading: {
    en: 'Uploading…',
    gu: 'અપલોડ થઈ રહ્યું છે…',
  },
  docUploadReady: {
    en: 'File selected. Upload to continue.',
    gu: 'ફાઇલ પસંદ થઈ. ચાલુ રાખવા અપલોડ કરો.',
  },
  docUploadUnavailable: {
    en: 'Document upload is temporarily unavailable.',
    gu: 'દસ્તાવેજ અપલોડ હાલમાં અનુપલબ્ધ છે.',
  },
  docUploadConfigInvalid: {
    en: 'This field is temporarily unavailable because its configuration is invalid.',
    gu: 'આ ક્ષેત્રની ગોઠવણી અમાન્ય હોવાથી હાલમાં અનુપલબ્ધ છે.',
  },
  docUploadRejected: {
    en: 'This file could not be accepted. Please choose a different file.',
    gu: 'આ ફાઇલ સ્વીકારી શકાઈ નથી. કૃપા કરીને બીજી ફાઇલ પસંદ કરો.',
  },
  docUploadMimeRejected: {
    en: 'This file type is not allowed.',
    gu: 'આ ફાઇલ પ્રકાર મંજૂર નથી.',
  },
  docUploadSizeRejected: {
    en: 'This file is too large.',
    gu: 'આ ફાઇલ ખૂબ મોટી છે.',
  },
  docUploadedLabel: {
    en: 'Uploaded: {fileName}',
    gu: 'અપલોડ થયું: {fileName}',
  },
  docReplaceRemove: {
    en: 'Remove',
    gu: 'દૂર કરો',
  },
  digiLockerFetchAction: {
    en: 'Fetch from DigiLocker',
    gu: 'DigiLockerમાંથી મેળવો',
  },
  digiLockerFetching: {
    en: 'Fetching document…',
    gu: 'દસ્તાવેજ મેળવાઈ રહ્યો છે…',
  },
  digiLockerUnavailable: {
    en: 'DigiLocker fetch is temporarily unavailable.',
    gu: 'DigiLocker દસ્તાવેજ મેળવવું હાલમાં અનુપલબ્ધ છે.',
  },
  digiLockerConfigInvalid: {
    en: 'This field is temporarily unavailable because its configuration is invalid.',
    gu: 'આ ક્ષેત્રની ગોઠવણી અમાન્ય હોવાથી હાલમાં અનુપલબ્ધ છે.',
  },
  digiLockerFetchedLabel: {
    en: 'Document reference received.',
    gu: 'દસ્તાવેજ સંદર્ભ મળ્યો.',
  },
  digiLockerReplaceRemove: {
    en: 'Remove',
    gu: 'દૂર કરો',
  },
  photoUploadAction: {
    en: 'Upload photo',
    gu: 'ફોટો અપલોડ કરો',
  },
  photoUploading: {
    en: 'Uploading photo…',
    gu: 'ફોટો અપલોડ થઈ રહ્યો છે…',
  },
  photoCaptureReady: {
    en: 'Photo selected. Upload to continue.',
    gu: 'ફોટો પસંદ થયો. ચાલુ રાખવા અપલોડ કરો.',
  },
  photoCaptureUnavailable: {
    en: 'Photo capture is temporarily unavailable.',
    gu: 'ફોટો કેપ્ચર હાલમાં અનુપલબ્ધ છે.',
  },
  photoCaptureRejected: {
    en: 'This photo could not be accepted. Please choose a different image.',
    gu: 'આ ફોટો સ્વીકારી શકાયો નથી. કૃપા કરીને બીજી છબી પસંદ કરો.',
  },
  photoMimeRejected: {
    en: 'Only JPEG and PNG photos are allowed.',
    gu: 'માત્ર JPEG અને PNG ફોટા મંજૂર છે.',
  },
  photoSizeRejected: {
    en: 'This photo is too large.',
    gu: 'આ ફોટો ખૂબ મોટો છે.',
  },
  photoCapturedLabel: {
    en: 'Photo saved ({width}×{height}).',
    gu: 'ફોટો સાચવાયો ({width}×{height}).',
  },
  photoReplaceRemove: {
    en: 'Remove',
    gu: 'દૂર કરો',
  },
  masterDataLoading: {
    en: 'Loading options…',
    gu: 'વિકલ્પો લોડ થઈ રહ્યા છે…',
  },
  masterDataEmpty: {
    en: 'No options are available for this list.',
    gu: 'આ યાદી માટે કોઈ વિકલ્પ ઉપલબ્ધ નથી.',
  },
  masterDataUnavailable: {
    en: 'This choice list is temporarily unavailable.',
    gu: 'આ પસંદગી યાદી હાલમાં અનુપલબ્ધ છે.',
  },
  masterDataLoadFailed: {
    en: 'Options could not be loaded.',
    gu: 'વિકલ્પો લોડ થઈ શક્યા નથી.',
  },
  masterDataConfigInvalid: {
    en: 'This field is temporarily unavailable because its configuration is invalid.',
    gu: 'આ ક્ષેત્રની ગોઠવણી અમાન્ય હોવાથી હાલમાં અનુપલબ્ધ છે.',
  },
  masterDataSelectPlaceholder: {
    en: 'Select an option',
    gu: 'એક વિકલ્પ પસંદ કરો',
  },
  masterDataUnknownValue: {
    en: 'The saved value is not in the current option list.',
    gu: 'સાચવેલું મૂલ્ય વર્તમાન વિકલ્પ યાદીમાં નથી.',
  },
  yesNoYes: {
    en: 'Yes',
    gu: 'હા',
  },
  yesNoNo: {
    en: 'No',
    gu: 'ના',
  },
  yesNoInvalidValue: {
    en: 'The saved value is not a valid Yes/No choice.',
    gu: 'સાચવેલું મૂલ્ય માન્ય હા/ના પસંદગી નથી.',
  },
  multiselectConfigInvalid: {
    en: 'This field is temporarily unavailable because its configuration is invalid.',
    gu: 'આ ક્ષેત્રની ગોઠવણી અમાન્ય હોવાથી હાલમાં અનુપલબ્ધ છે.',
  },
  multiselectInvalidValue: {
    en: 'The saved selection is not valid for the current option list.',
    gu: 'સાચવેલી પસંદગી વર્તમાન વિકલ્પ યાદી માટે માન્ય નથી.',
  },
  multiselectBelowMinimum: {
    en: 'Select at least {count} option(s).',
    gu: 'ઓછામાં ઓછા {count} વિકલ્પ(ો) પસંદ કરો.',
  },
  cascadingConfigInvalid: {
    en: 'This field is temporarily unavailable because its configuration is invalid.',
    gu: 'આ ક્ષેત્રની ગોઠવણી અમાન્ય હોવાથી હાલમાં અનુપલબ્ધ છે.',
  },
  cascadingInvalidValue: {
    en: 'The saved cascading selection is not valid for the current lists.',
    gu: 'સાચવેલી કાસ્કેડિંગ પસંદગી વર્તમાન યાદીઓ માટે માન્ય નથી.',
  },
  cascadingParentLabel: {
    en: 'Parent',
    gu: 'પેરેન્ટ',
  },
  cascadingChildLabel: {
    en: 'Child',
    gu: 'ચાઇલ્ડ',
  },
  cascadingSelectParentFirst: {
    en: 'Select a parent option first.',
    gu: 'પહેલા પેરેન્ટ વિકલ્પ પસંદ કરો.',
  },
  bankAccountNumberLabel: {
    en: 'Account number',
    gu: 'ખાતા નંબર',
  },
  bankIfscLabel: {
    en: 'IFSC',
    gu: 'IFSC',
  },
  bankAccountHolderLabel: {
    en: 'Account holder name',
    gu: 'ખાતાધારકનું નામ',
  },
  bankVerifyAction: {
    en: 'Verify account name',
    gu: 'ખાતા નામ ચકાસો',
  },
  bankVerifying: {
    en: 'Verifying account name…',
    gu: 'ખાતા નામ ચકાસાઈ રહ્યું છે…',
  },
  bankVerified: {
    en: 'Account name verified.',
    gu: 'ખાતા નામ ચકાસાયું.',
  },
  bankVerificationUnavailable: {
    en: 'Account verification is temporarily unavailable.',
    gu: 'ખાતા ચકાસણી હાલમાં અનુપલબ્ધ છે.',
  },
  bankVerificationMismatch: {
    en: 'The account details could not be matched. Check the details and try again.',
    gu: 'ખાતાની વિગતો મેળ ખાઈ શકી નથી. વિગતો તપાસીને ફરી પ્રયાસ કરો.',
  },
  bankVerificationFailed: {
    en: 'Account verification could not be completed. Please try again.',
    gu: 'ખાતા ચકાસણી પૂર્ણ થઈ શકી નથી. કૃપા કરીને ફરી પ્રયાસ કરો.',
  },
  bankInvalidInput: {
    en: 'Enter a valid account number, IFSC and account holder name before verifying.',
    gu: 'ચકાસણી પહેલાં માન્ય ખાતા નંબર, IFSC અને ખાતાધારકનું નામ દાખલ કરો.',
  },
  bankAccountNumberInvalid: {
    en: 'Enter a valid account number using digits only (6 to 20 digits).',
    gu: 'ફક્ત અંકો વાપરીને માન્ય ખાતા નંબર દાખલ કરો (6 થી 20 અંકો).',
  },
  bankIfscInvalid: {
    en: 'Enter a valid IFSC code.',
    gu: 'માન્ય IFSC કોડ દાખલ કરો.',
  },
  bankInvalidValue: {
    en: 'The saved bank account value is not valid.',
    gu: 'સાચવેલું બેંક ખાતું માન્ય નથી.',
  },
  bankAccountNumberUnavailable: {
    en: 'No account number on file.',
    gu: 'ખાતા નંબર ઉપલબ્ધ નથી.',
  },
  declarationAcceptLabel: {
    en: 'I accept this declaration',
    gu: 'હું આ ઘોષણા સ્વીકારું છું',
  },
  declarationRecording: {
    en: 'Recording your decision…',
    gu: 'તમારો નિર્ણય નોંધાઈ રહ્યો છે…',
  },
  declarationRecorded: {
    en: 'Decision recorded.',
    gu: 'નિર્ણય નોંધાયો.',
  },
  declarationUnavailable: {
    en: 'Consent recording is temporarily unavailable.',
    gu: 'સંમતિ નોંધણી હાલમાં અનુપલબ્ધ છે.',
  },
  declarationConfigInvalid: {
    en: 'This declaration is misconfigured.',
    gu: 'આ ઘોષણાનું ગોઠવણ અમાન્ય છે.',
  },
  declarationFailed: {
    en: 'Your decision could not be recorded. Please try again.',
    gu: 'તમારો નિર્ણય નોંધી શકાયો નહીં. કૃપા કરીને ફરી પ્રયાસ કરો.',
  },
  declarationInvalidValue: {
    en: 'The saved declaration decision is not valid.',
    gu: 'સાચવેલો ઘોષણા નિર્ણય માન્ય નથી.',
  },
  feeCalculating: {
    en: 'Calculating fee…',
    gu: 'ફી ગણાઈ રહી છે…',
  },
  feeComputed: {
    en: 'Fee calculated.',
    gu: 'ફી ગણાઈ.',
  },
  feeComputationUnavailable: {
    en: 'Fee calculation is temporarily unavailable.',
    gu: 'ફી ગણતરી હાલમાં અનુપલબ્ધ છે.',
  },
  feeContextUnavailable: {
    en: 'Fee calculation is waiting for form context.',
    gu: 'ફી ગણતરી ફોર્મ સંદર્ભની રાહ જુએ છે.',
  },
  feeConfigInvalid: {
    en: 'This fee field is misconfigured.',
    gu: 'આ ફી ક્ષેત્રનું ગોઠવણ અમાન્ય છે.',
  },
  feeComputationFailed: {
    en: 'The fee could not be calculated. Please try again.',
    gu: 'ફી ગણી શકાઈ નહીં. કૃપા કરીને ફરી પ્રયાસ કરો.',
  },
  feeInvalidValue: {
    en: 'The saved fee value is not valid.',
    gu: 'સાચવેલું ફી મૂલ્ય માન્ય નથી.',
  },
  feeAmountUnavailable: {
    en: 'Fee not available yet.',
    gu: 'ફી હજુ ઉપલબ્ધ નથી.',
  },
  eSignSignAction: {
    en: 'Sign with eSign',
    gu: 'eSign વડે સહી કરો',
  },
  eSignReplaceAction: {
    en: 'Sign again / Replace signature',
    gu: 'ફરી સહી કરો / સહી બદલો',
  },
  eSignSigning: {
    en: 'Signing in progress…',
    gu: 'સહી ચાલુ છે…',
  },
  eSignSigned: {
    en: 'Document signed.',
    gu: 'દસ્તાવેજ સહી થયો.',
  },
  eSignUnsigned: {
    en: 'Not signed yet.',
    gu: 'હજુ સહી થયેલ નથી.',
  },
  eSignStaleStatus: {
    en: 'Previous signature is for older content. Sign again for the current document.',
    gu: 'પહેલાંની સહી જૂની સામગ્રી માટે છે. વર્તમાન દસ્તાવેજ માટે ફરી સહી કરો.',
  },
  eSignCancelled: {
    en: 'Signing was cancelled.',
    gu: 'સહી રદ થઈ.',
  },
  eSignCancelledRetained: {
    en: 'The new signing attempt was cancelled. Your previous signature remains.',
    gu: 'નવો સહી પ્રયાસ રદ થયો. તમારી પહેલાંની સહી યથાવત રહે છે.',
  },
  eSignUnavailable: {
    en: 'eSign is temporarily unavailable.',
    gu: 'eSign હાલમાં અનુપલબ્ધ છે.',
  },
  eSignContextUnavailable: {
    en: 'Signing is waiting for document context.',
    gu: 'સહી દસ્તાવેજ સંદર્ભની રાહ જુએ છે.',
  },
  eSignFailed: {
    en: 'Signing could not be completed. Please try again.',
    gu: 'સહી પૂર્ણ થઈ શકી નથી. કૃપા કરીને ફરી પ્રયાસ કરો.',
  },
  eSignFailedRetained: {
    en: 'The new signing attempt could not be completed. Your previous signature remains.',
    gu: 'નવો સહી પ્રયાસ પૂર્ણ થઈ શક્યો નથી. તમારી પહેલાંની સહી યથાવત રહે છે.',
  },
  eSignInvalidValue: {
    en: 'The saved signature value is not valid.',
    gu: 'સાચવેલું સહી મૂલ્ય માન્ય નથી.',
  },
  familyRepeaterMemberHeading: {
    en: 'Family member {number}',
    gu: 'કુટુંબ સભ્ય {number}',
  },
  familyRepeaterAddAction: {
    en: 'Add family member',
    gu: 'કુટુંબ સભ્ય ઉમેરો',
  },
  familyRepeaterRemoveAction: {
    en: 'Remove family member {number}',
    gu: 'કુટુંબ સભ્ય {number} દૂર કરો',
  },
  familyRepeaterConfigInvalid: {
    en: 'This family member list is misconfigured.',
    gu: 'આ કુટુંબ સભ્ય યાદીનું ગોઠવણ અમાન્ય છે.',
  },
  familyRepeaterInvalidValue: {
    en: 'The saved family member list is not valid.',
    gu: 'સાચવેલી કુટુંબ સભ્ય યાદી માન્ય નથી.',
  },
  familyRepeaterBelowMinimum: {
    en: 'Add at least {count} family member(s).',
    gu: 'ઓછામાં ઓછા {count} કુટુંબ સભ્ય(ઓ) ઉમેરો.',
  },
  familyRepeaterMaxReached: {
    en: 'Maximum of {count} family members reached.',
    gu: 'મહત્તમ {count} કુટુંબ સભ્યોની મર્યાદા પહોંચી.',
  },
}

function applyParams(template: string, params: WidgetMessageParams | undefined): string {
  if (!params) {
    return template
  }
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key: string) => {
    const value = params[key]
    if (value === undefined) {
      return match
    }
    return String(value)
  })
}

export function resolveWidgetMessage(
  key: WidgetMessageKey,
  locale: WidgetLocale,
  params?: WidgetMessageParams,
  overrides?: WidgetMessageOverrides,
): string {
  const pair = overrides?.[key] ?? CATALOGUE[key]
  const preferred = locale === 'gu' ? pair.gu : pair.en
  const text =
    preferred.trim().length > 0 ? preferred : pair.en.trim().length > 0 ? pair.en : pair.gu
  return applyParams(text, params)
}

export function getDefaultWidgetMessageCatalogue(): Readonly<
  Record<WidgetMessageKey, LocalizedValue>
> {
  return CATALOGUE
}

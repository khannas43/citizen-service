import type {
  PaletteGroupDefinition,
  PaletteGroupId,
  PaletteWidgetDefinition,
} from './palette-types.js'
import { PALETTE_GROUP_IDS } from './palette-types.js'

/**
 * Controlled field palette registry (spec §4).
 *
 * Exact count from specification tables 4.1–4.6: **30** widget types
 * (narrative "~28" is approximate; layout/display primitives are included).
 *
 * The palette is not user-extensible. There is no custom-field or raw-json
 * widget. Registry changes are a governed engineering change.
 */

export const PALETTE_GROUPS: readonly PaletteGroupDefinition[] = [
  {
    groupId: 'identity-citizen',
    labelEn: 'Identity & citizen data',
    labelGu: 'ઓળખ અને નાગરિક માહિતી',
    descriptionEn: 'CAF-linked identity and citizen demographic fields (spec §4.1).',
    descriptionGu: 'CAF સાથે જોડાયેલી ઓળખ અને નાગરિક વસ્તીવિષયક ક્ષેત્રો (સ્પેક §4.1).',
    specSection: '4.1',
  },
  {
    groupId: 'address',
    labelEn: 'Address',
    labelGu: 'સરનામું',
    descriptionEn: 'Geographic address cascade and PIN code (spec §4.2).',
    descriptionGu: 'ભૌગોલિક સરનામાંની શ્રેણી અને પિન કોડ (સ્પેક §4.2).',
    specSection: '4.2',
  },
  {
    groupId: 'documents',
    labelEn: 'Documents',
    labelGu: 'દસ્તાવેજો',
    descriptionEn: 'Uploads, DigiLocker fetch, and photo capture (spec §4.3).',
    descriptionGu: 'અપલોડ, DigiLocker દસ્તાવેજ મેળવવું અને ફોટો કેપ્ચર (સ્પેક §4.3).',
    specSection: '4.3',
  },
  {
    groupId: 'choice-structured',
    labelEn: 'Choice & structured input',
    labelGu: 'પસંદગી અને સંરચિત ઇનપુટ',
    descriptionEn: 'Master-data-backed choices and boolean inputs (spec §4.4).',
    descriptionGu: 'માસ્ટર-ડેટા આધારિત પસંદગીઓ અને બુલિયન ઇનપુટ (સ્પેક §4.4).',
    specSection: '4.4',
  },
  {
    groupId: 'free-numeric',
    labelEn: 'Free & numeric input',
    labelGu: 'મુક્ત અને આંકડાકીય ઇનપુટ',
    descriptionEn: 'Text, number, currency, and percentage fields (spec §4.5).',
    descriptionGu: 'ટેક્સ્ટ, સંખ્યા, ચલણ અને ટકાવારી ક્ષેત્રો (સ્પેક §4.5).',
    specSection: '4.5',
  },
  {
    groupId: 'government-composite-layout',
    labelEn: 'Government composites & layout',
    labelGu: 'સરકારી સંયુક્ત ઘટકો અને લેઆઉટ',
    descriptionEn: 'Bank, family, declarations, fees, eSign, and layout primitives (spec §4.6).',
    descriptionGu: 'બેંક, કુટુંબ, ઘોષણા, ફી, eSign અને લેઆઉટ પ્રાથમિક ઘટકો (સ્પેક §4.6).',
    specSection: '4.6',
  },
] as const

const WIDGET_DEFINITIONS: readonly PaletteWidgetDefinition[] = [
  // —— §4.1 Identity & citizen data ——
  {
    widgetType: 'aadhaar',
    groupId: 'identity-citizen',
    category: 'data',
    labelEn: 'Aadhaar',
    labelGu: 'આધાર',
    descriptionEn: '12-digit / VID Aadhaar input with Verhoeff checksum and masking.',
    descriptionGu: '12 અંક / VID આધાર ઇનપુટ — Verhoeff ચેકસમ અને માસ્કિંગ સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required'],
    bakedInBehaviours: [
      '12-digit or VID format',
      'Verhoeff checksum',
      'always masked',
      'never stores raw value (ref token only)',
    ],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'mobile-otp',
    groupId: 'identity-citizen',
    category: 'data',
    labelEn: 'Mobile with OTP',
    labelGu: 'મોબાઇલ OTP સાથે',
    descriptionEn: '10-digit mobile number verified via OTP through the Notification service.',
    descriptionGu: 'Notification સેવા દ્વારા OTP દ્વારા ચકાસાયેલો 10-અંકીય મોબાઇલ નંબર.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'OTP channel(s)'],
    bakedInBehaviours: [
      '10-digit mobile format',
      'OTP verify via Notification service',
      'verified-state stored',
    ],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'email',
    groupId: 'identity-citizen',
    category: 'data',
    labelEn: 'Email',
    labelGu: 'ઇમેઇલ',
    descriptionEn: 'RFC-5322 email with optional verification link.',
    descriptionGu: 'RFC-5322 ઇમેઇલ — વૈકલ્પિક ચકાસણી લિંક સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'verify on/off'],
    bakedInBehaviours: ['RFC-5322 validation', 'optional verify link'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'full-name',
    groupId: 'identity-citizen',
    category: 'data',
    labelEn: 'Full name',
    labelGu: 'પૂરું નામ',
    descriptionEn: 'Full name captured as an EN + GU transliteration pair.',
    descriptionGu: 'અંગ્રેજી અને ગુજરાતી લિપ્યંતરણ જોડી તરીકે પૂરું નામ.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required'],
    bakedInBehaviours: ['EN + GU transliteration pair'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'dob',
    groupId: 'identity-citizen',
    category: 'data',
    labelEn: 'Date of birth',
    labelGu: 'જન્મ તારીખ',
    descriptionEn: 'Date of birth with age derivation and min/max age gates.',
    descriptionGu: 'જન્મ તારીખ — ઉંમર ગણતરી અને ન્યૂનતમ/મહત્તમ ઉંમર મર્યાદા સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'min/max age'],
    bakedInBehaviours: ['date input', 'age derivation', 'min/max age gate'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'gender',
    groupId: 'identity-citizen',
    category: 'data',
    labelEn: 'Gender',
    labelGu: 'લિંગ',
    descriptionEn: 'Fixed gender enum (M/F/Other per government standard).',
    descriptionGu: 'નિયત લિંગ વિકલ્પો (પુરુષ/સ્ત્રી/અન્ય — સરકારી માનક અનુસાર).',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required'],
    bakedInBehaviours: ['fixed enum M/F/Other per government standard'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'caf-prefill',
    groupId: 'identity-citizen',
    category: 'data',
    labelEn: 'CAF pre-fill',
    labelGu: 'CAF પૂર્વ-ભરણ',
    descriptionEn:
      'Binds to a Golden Record / CAF attribute with pre-fill indicator and edit/override.',
    descriptionGu:
      'Golden Record / CAF વિશેષતા સાથે જોડાણ — પૂર્વ-ભરણ સૂચક અને સંપાદન/ઓવરરાઇડ સાથે.',
    producesData: true,
    supportsRequired: false,
    configurableProperties: ['label', 'cafAttribute', 'confidenceMin'],
    bakedInBehaviours: [
      'Golden Record attribute binding',
      'pre-fill indicator',
      'edit/override (SI-3.2.1-17)',
    ],
    implementationStatus: 'implemented',
  },

  // —— §4.2 Address ——
  {
    widgetType: 'address-block',
    groupId: 'address',
    category: 'data',
    labelEn: 'Address block',
    labelGu: 'સરનામું બ્લોક',
    descriptionEn: 'State → District → Taluka → Village cascade from master data.',
    descriptionGu: 'માસ્ટર-ડેટાથી રાજ્ય → જિલ્લો → તાલુકો → ગામ કાસ્કેડ.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'default state'],
    bakedInBehaviours: ['State→District→Taluka→Village cascade from master-data'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'pincode',
    groupId: 'address',
    category: 'data',
    labelEn: 'PIN code',
    labelGu: 'પિન કોડ',
    descriptionEn: '6-digit PIN code that auto-fills city/district.',
    descriptionGu: '6-અંકીય પિન કોડ — શહેર/જિલ્લો આપોઆપ ભરાય છે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required'],
    bakedInBehaviours: ['6-digit format', 'auto-fills city/district'],
    implementationStatus: 'implemented',
  },

  // —— §4.3 Documents ——
  {
    widgetType: 'doc-upload',
    groupId: 'documents',
    category: 'data',
    labelEn: 'Document upload',
    labelGu: 'દસ્તાવેજ અપલોડ',
    descriptionEn: 'Type-restricted, size-capped upload with virus-scan hook and object-store ref.',
    descriptionGu:
      'પ્રકાર-મર્યાદિત, કદ-મર્યાદિત અપલોડ — વાયરસ સ્કેન હુક અને ઑબ્જેક્ટ-સ્ટોર સંદર્ભ સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'allowed types', 'max size'],
    bakedInBehaviours: [
      'type-restricted upload',
      'size-capped',
      'virus-scan hook',
      'object-store ref (not blob)',
    ],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'digilocker-fetch',
    groupId: 'documents',
    category: 'data',
    labelEn: 'DigiLocker fetch',
    labelGu: 'DigiLocker દસ્તાવેજ મેળવો',
    descriptionEn: 'Pulls an issued document via DigiLocker; stores issuer-signed ref.',
    descriptionGu: 'DigiLocker દ્વારા જારી દસ્તાવેજ મેળવે છે; ઇશ્યુઅર-સહી કરેલો સંદર્ભ સંગ્રહે છે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'doc type'],
    bakedInBehaviours: ['DigiLocker issued-doc pull', 'stores issuer-signed ref'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'photo-capture',
    groupId: 'documents',
    category: 'data',
    labelEn: 'Photo capture',
    labelGu: 'ફોટો કેપ્ચર',
    descriptionEn: 'Camera or upload photo with dimension and size constraints.',
    descriptionGu: 'કેમેરા અથવા અપલોડ ફોટો — પરિમાણ અને કદની મર્યાદાઓ સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required'],
    bakedInBehaviours: ['camera or upload', 'dimension + size constraints'],
    implementationStatus: 'implemented',
  },

  // —— §4.4 Choice & structured input ——
  {
    widgetType: 'dropdown-master',
    groupId: 'choice-structured',
    category: 'data',
    labelEn: 'Master-data dropdown',
    labelGu: 'માસ્ટર-ડેટા ડ્રોપડાઉન',
    descriptionEn: 'Single-select options from a referenced master-data list (not free-typed).',
    descriptionGu: 'માસ્ટર-ડેટા યાદીમાંથી એક પસંદગી (મુક્ત ટાઇપિંગ નહીં).',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'master-list id'],
    bakedInBehaviours: ['options from referenced master-data list', 'not free-typed'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'radio',
    groupId: 'choice-structured',
    category: 'data',
    labelEn: 'Radio group',
    labelGu: 'રેડિયો પસંદગી',
    descriptionEn: 'Single-select radio group backed by a master-data list.',
    descriptionGu: 'માસ્ટર-ડેટા યાદી આધારિત એક પસંદગી રેડિયો ગ્રુપ.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'master-list id'],
    bakedInBehaviours: ['single select'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'multiselect',
    groupId: 'choice-structured',
    category: 'data',
    labelEn: 'Multi-select',
    labelGu: 'બહુ-પસંદગી',
    descriptionEn: 'Multiple select from a master-data list with optional min/max.',
    descriptionGu: 'માસ્ટર-ડેટા યાદીમાંથી બહુવિધ પસંદગી — વૈકલ્પિક ન્યૂનતમ/મહત્તમ સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'master-list id', 'min/max'],
    bakedInBehaviours: ['multiple select'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'yesno',
    groupId: 'choice-structured',
    category: 'data',
    labelEn: 'Yes / No',
    labelGu: 'હા / ના',
    descriptionEn: 'Boolean yes/no choice.',
    descriptionGu: 'બુલિયન હા/ના પસંદગી.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required'],
    bakedInBehaviours: ['boolean'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'cascading-dropdown',
    groupId: 'choice-structured',
    category: 'data',
    labelEn: 'Cascading dropdown',
    labelGu: 'કાસ્કેડિંગ ડ્રોપડાઉન',
    descriptionEn: 'Parent→child dependent lists from master data.',
    descriptionGu: 'માસ્ટર-ડેટામાંથી પેરેન્ટ→ચાઇલ્ડ આધારિત યાદીઓ.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'parent+child list ids'],
    bakedInBehaviours: ['parent→child dependent lists from master-data'],
    implementationStatus: 'implemented',
  },

  // —— §4.5 Free & numeric input ——
  {
    widgetType: 'text-short',
    groupId: 'free-numeric',
    category: 'data',
    labelEn: 'Short text',
    labelGu: 'ટૂંકું લખાણ',
    descriptionEn: 'Single-line text with optional regex and max length.',
    descriptionGu: 'એક લીટીનું લખાણ — વૈકલ્પિક regex અને મહત્તમ લંબાઈ સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'regex', 'max len'],
    bakedInBehaviours: ['single line', 'regex-constrained'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'text-long',
    groupId: 'free-numeric',
    category: 'data',
    labelEn: 'Long text',
    labelGu: 'લાંબું લખાણ',
    descriptionEn: 'Multi-line text with max length.',
    descriptionGu: 'બહુ-લીટી લખાણ — મહત્તમ લંબાઈ સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'max len'],
    bakedInBehaviours: ['multi-line'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'number',
    groupId: 'free-numeric',
    category: 'data',
    labelEn: 'Number',
    labelGu: 'સંખ્યા',
    descriptionEn: 'Numeric input with min, max, and step.',
    descriptionGu: 'આંકડાકીય ઇનપુટ — ન્યૂનતમ, મહત્તમ અને પગલું સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'min', 'max', 'step'],
    bakedInBehaviours: ['numeric', 'min/max/step'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'currency-inr',
    groupId: 'free-numeric',
    category: 'data',
    labelEn: 'Currency (₹)',
    labelGu: 'ચલણ (₹)',
    descriptionEn: 'Indian Rupee amount with 2-decimal, non-negative constraint.',
    descriptionGu: 'ભારતીય રૂપિયા રકમ — 2 દશાંશ અને બિન-નકારાત્મક મર્યાદા સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required', 'min', 'max'],
    bakedInBehaviours: ['₹ formatting', '2-decimal', 'non-negative'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'percentage',
    groupId: 'free-numeric',
    category: 'data',
    labelEn: 'Percentage',
    labelGu: 'ટકાવારી',
    descriptionEn: 'Percentage value from 0–100 with step.',
    descriptionGu: '0–100 ટકાવારી મૂલ્ય — પગલું સાથે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required'],
    bakedInBehaviours: ['0–100 range', 'step'],
    implementationStatus: 'implemented',
  },

  // —— §4.6 Government composites & layout ——
  {
    widgetType: 'bank-account',
    groupId: 'government-composite-layout',
    category: 'data',
    labelEn: 'Bank account',
    labelGu: 'બેંક ખાતું',
    descriptionEn: 'Bank account with IFSC validation and account-name verify hook.',
    descriptionGu: 'IFSC ચકાસણી અને ખાતા-નામ ચકાસણી હુક સાથે બેંક ખાતું.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required'],
    bakedInBehaviours: ['IFSC-validated', 'account-name verify hook'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'family-repeater',
    groupId: 'government-composite-layout',
    category: 'data',
    labelEn: 'Family repeater',
    labelGu: 'કુટુંબ સભ્ય પુનરાવર્તક',
    descriptionEn: 'Add-N dependents; each row is a configured sub-form.',
    descriptionGu: 'N આશ્રિતો ઉમેરો; દરેક પંક્તિ એક સબ-ફોર્મ છે.',
    producesData: true,
    supportsRequired: false,
    configurableProperties: ['label', 'member fields', 'min/max rows'],
    bakedInBehaviours: ['add-N dependents', 'each row is a sub-form'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'eligibility-declaration',
    groupId: 'government-composite-layout',
    category: 'data',
    labelEn: 'Eligibility declaration',
    labelGu: 'પાત્રતા ઘોષણા',
    descriptionEn: 'Consent-linked declaration checkbox with DPDP logging.',
    descriptionGu: 'સંમતિ સાથે જોડાયેલી ઘોષણા ચેકબોક્સ — DPDP લૉગિંગ સાથે.',
    producesData: true,
    supportsRequired: false,
    configurableProperties: ['label', 'declaration text (EN/GU)'],
    bakedInBehaviours: ['consent-linked checkbox', 'DPDP-logged'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'fee-field',
    groupId: 'government-composite-layout',
    category: 'data',
    labelEn: 'Fee field',
    labelGu: 'ફી ક્ષેત્ર',
    descriptionEn: 'Read-only computed fee bound to a fee-engine rule.',
    descriptionGu: 'ફી-એન્જિન નિયમ સાથે જોડાયેલું ફક્ત-વાંચવા યોગ્ય ગણતરી કરેલું ફી ક્ષેત્ર.',
    producesData: true,
    supportsRequired: false,
    configurableProperties: ['label', 'fee rule id'],
    bakedInBehaviours: ['binds to fee engine', 'read-only computed'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'signature-esign',
    groupId: 'government-composite-layout',
    category: 'data',
    labelEn: 'eSign signature',
    labelGu: 'eSign સહી',
    descriptionEn: 'Triggers the eSign flow and stores a signed artefact reference.',
    descriptionGu: 'eSign પ્રવાહ શરૂ કરે છે અને સહી કરેલા આર્ટિફેક્ટનો સંદર્ભ સંગ્રહે છે.',
    producesData: true,
    supportsRequired: true,
    configurableProperties: ['label', 'required'],
    bakedInBehaviours: ['triggers eSign flow', 'stores signed artefact ref'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'section-header',
    groupId: 'government-composite-layout',
    category: 'display',
    labelEn: 'Section header',
    labelGu: 'વિભાગ શીર્ષક',
    descriptionEn: 'Visual section grouping; produces no form data.',
    descriptionGu: 'દૃશ્ય વિભાગ જૂથીકરણ; કોઈ ફોર્મ ડેટા ઉત્પન્ન કરતું નથી.',
    producesData: false,
    supportsRequired: false,
    configurableProperties: ['label (EN/GU)'],
    bakedInBehaviours: ['groups fields visually', 'no data'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'info-panel',
    groupId: 'government-composite-layout',
    category: 'display',
    labelEn: 'Info panel',
    labelGu: 'માહિતી પેનલ',
    descriptionEn: 'Static help or notice content; produces no form data.',
    descriptionGu: 'સ્થિર મદદ અથવા સૂચના સામગ્રી; કોઈ ફોર્મ ડેટા ઉત્પન્ન કરતું નથી.',
    producesData: false,
    supportsRequired: false,
    configurableProperties: ['content (EN/GU)'],
    bakedInBehaviours: ['static help/notice', 'no data'],
    implementationStatus: 'implemented',
  },
  {
    widgetType: 'page-break',
    groupId: 'government-composite-layout',
    category: 'layout',
    labelEn: 'Page break',
    labelGu: 'પૃષ્ઠ વિરામ',
    descriptionEn: 'Progressive-profiling step boundary; produces no form data.',
    descriptionGu: 'પ્રગતિશીલ ભરણના પગલાની સીમા; કોઈ ફોર્મ ડેટા ઉત્પન્ન કરતું નથી.',
    producesData: false,
    supportsRequired: false,
    configurableProperties: ['step label (EN/GU)'],
    bakedInBehaviours: ['progressive-profiling step boundary'],
    implementationStatus: 'implemented',
  },
] as const

/**
 * Builds an immutable registry map, throwing if duplicate widgetType IDs exist.
 */
export function buildPaletteRegistry(
  widgets: readonly PaletteWidgetDefinition[],
): ReadonlyMap<string, PaletteWidgetDefinition> {
  const map = new Map<string, PaletteWidgetDefinition>()
  for (const widget of widgets) {
    if (map.has(widget.widgetType)) {
      throw new Error(`Duplicate palette widgetType: ${widget.widgetType}`)
    }
    if (!(PALETTE_GROUP_IDS as readonly string[]).includes(widget.groupId)) {
      throw new Error(`Widget ${widget.widgetType} references unknown groupId: ${widget.groupId}`)
    }
    map.set(widget.widgetType, widget)
  }
  return map
}

const registryMap = buildPaletteRegistry(WIDGET_DEFINITIONS)

/** Exact count of widgets declared in specification §4 tables. */
export const PALETTE_WIDGET_COUNT = WIDGET_DEFINITIONS.length

/** Readonly ordered list of all approved palette widgets. */
export const PALETTE_REGISTRY: readonly PaletteWidgetDefinition[] = WIDGET_DEFINITIONS

/** Readonly lookup map keyed by widgetType. */
export const PALETTE_BY_TYPE: ReadonlyMap<string, PaletteWidgetDefinition> = registryMap

export function getPaletteWidget(widgetType: string): PaletteWidgetDefinition | undefined {
  return PALETTE_BY_TYPE.get(widgetType)
}

export function getPaletteGroup(groupId: PaletteGroupId): PaletteGroupDefinition | undefined {
  return PALETTE_GROUPS.find((group) => group.groupId === groupId)
}

export function listWidgetsByGroup(groupId: PaletteGroupId): readonly PaletteWidgetDefinition[] {
  return PALETTE_REGISTRY.filter((widget) => widget.groupId === groupId)
}

export function isApprovedWidgetType(widgetType: string): boolean {
  return PALETTE_BY_TYPE.has(widgetType)
}

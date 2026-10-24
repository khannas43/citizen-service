import { pinDemoSchemeFirst, translateCriterion } from '../reasonUtils'

export const CASTE_OPTIONS = ['SC', 'ST', 'OBC', 'NT', 'GENERAL', 'EWS']
export const DISTRICTS = [
  'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Bhavnagar', 'Jamnagar',
  'Junagadh', 'Kutch', 'Mehsana', 'Anand', 'Bharuch', 'Narmada', 'Sabarkantha',
  'Banaskantha', 'Patan', 'Surendranagar', 'Morbi', 'Amreli', 'Botad', 'Porbandar',
  'Navsari', 'Valsad', 'Dang', 'Tapi', 'Mahisagar', 'Chhota Udaipur', 'Aravalli',
  'Dahod', 'Panchmahal', 'Kheda', 'Gir Somnath',
]

export const MARITAL_OPTIONS = ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED', 'SEPARATED']
export const EMPLOYMENT_OPTIONS = [
  'FARMER', 'AGRICULTURIST', 'SELF_EMPLOYED', 'EMPLOYED', 'UNEMPLOYED', 'STUDENT', 'HOMEMAKER', 'RETIRED',
]
export const EDUCATION_OPTIONS = ['NONE', 'PRIMARY', 'SECONDARY', 'MATRIC', 'HIGHER_SEC', 'GRADUATE', 'POST_GRADUATE']

export const GENDER_OPTIONS = [
  { value: 'F', labelKey: 'genderF' },
  { value: 'M', labelKey: 'genderM' },
  { value: 'O', labelKey: 'genderO' },
]

export const EXAM_TYPE_OPTIONS = [
  { value: 'STD10', labelKey: 'examStd10' },
  { value: 'STD12', labelKey: 'examStd12' },
  { value: 'DIPLOMA', labelKey: 'examDiploma' },
  { value: 'NEET_MBBS', labelKey: 'examNeet' },
]

export const COURSE_CATEGORY_OPTIONS = [
  { value: 'MEDICAL_DENTAL', labelKey: 'courseMedical' },
  { value: 'ENGINEERING_GROUP', labelKey: 'courseEngineering' },
  { value: 'DIPLOMA', labelKey: 'courseDiploma' },
  { value: 'ARTS_COMMERCE', labelKey: 'courseArts' },
]

export const FIELD_TO_FORM = {
  maritalStatus: 'maritalStatus',
  employmentStatus: 'employmentStatus',
  educationLevel: 'educationLevel',
  village: 'village',
  examType: 'examType',
  examPercentile: 'examPercentile',
}

export function emptyForm(profile) {
  return {
    dob: profile?.dob?.slice(0, 10) || '',
    age: profile?.age != null ? String(profile.age) : '',
    gender: profile?.gender || '',
    casteCategory: profile?.casteCategory || '',
    district: profile?.district || '',
    taluka: profile?.taluka || '',
    village: profile?.village || '',
    annualIncome: profile?.annualIncome != null ? String(profile.annualIncome) : '',
    educationLevel: profile?.educationLevel || '',
    maritalStatus: profile?.maritalStatus || '',
    employmentStatus: profile?.employmentStatus || '',
    includeScholarship: false,
    examType: '',
    examPercentile: '',
    courseCategory: '',
    talukaFreeText: false,
    villageFreeText: false,
  }
}

export function parseIncomeDisplay(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '')
  if (!digits) return { display: '', numeric: '' }
  return { display: digits, numeric: digits }
}

export function formatIncomeBlur(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-IN')
}

export function buildSuppliedFields(form) {
  const fields = ['gender', 'casteCategory', 'district']
  if (form.dob) fields.push('dob')
  else if (form.age) fields.push('age')
  if (form.annualIncome !== '') fields.push('annualIncome')
  if (form.maritalStatus) fields.push('maritalStatus')
  if (form.employmentStatus) fields.push('employmentStatus')
  if (form.educationLevel) fields.push('educationLevel')
  if (form.taluka) fields.push('taluka')
  if (form.village) fields.push('village')
  if (form.includeScholarship && form.examType) {
    fields.push('examType', 'examPercentile')
    if (form.courseCategory) fields.push('courseCategory')
  }
  return fields
}

export function buildPayload(form) {
  const incomeDigits = String(form.annualIncome || '').replace(/[^\d]/g, '')
  const payload = {
    gender: form.gender,
    casteCategory: form.casteCategory,
    district: form.district,
    taluka: form.taluka || null,
    village: form.village || null,
    annualIncome: incomeDigits ? Number(incomeDigits) : null,
    educationLevel: form.educationLevel || null,
    maritalStatus: form.maritalStatus || null,
    employmentStatus: form.employmentStatus || null,
    suppliedFields: buildSuppliedFields(form),
    ...(form.includeScholarship && form.examType
      ? {
          examType: form.examType,
          examPercentile: form.examPercentile ? Number(form.examPercentile) : null,
          courseCategory: form.courseCategory || null,
        }
      : {}),
  }
  if (form.dob) payload.dob = form.dob
  else if (form.age) payload.age = Number(form.age)
  return payload
}

export function buildPayloadFromSlots(slots) {
  const formLike = {
    gender: slots.gender || '',
    casteCategory: slots.casteCategory || '',
    district: slots.district || '',
    taluka: slots.taluka || '',
    village: slots.village || '',
    annualIncome: slots.annualIncome != null ? String(slots.annualIncome) : '',
    educationLevel: slots.educationLevel || '',
    maritalStatus: slots.maritalStatus || '',
    employmentStatus: slots.employmentStatus || '',
    dob: slots.dob || '',
    age: slots.age != null ? String(slots.age) : '',
    includeScholarship: false,
  }
  return buildPayload(formLike)
}

export function matchOutcome(m) {
  if (m.outcome) return m.outcome
  return m.eligible ? 'LIKELY_ELIGIBLE' : 'NOT_ELIGIBLE'
}

export function bucketMatches(result) {
  if (!result?.matches) return { likely: [], possible: [], notEligible: [] }
  const likely = []
  const possible = []
  const notEligible = []
  for (const m of result.matches) {
    const o = matchOutcome(m)
    if (o === 'LIKELY_ELIGIBLE') likely.push(m)
    else if (o === 'POSSIBLE') possible.push(m)
    else notEligible.push(m)
  }
  const pin = (rows) => pinDemoSchemeFirst(rows.map((m) => ({ ...m, name: m.schemeName })))
  return { likely: pin(likely), possible: pin(possible), notEligible: pin(notEligible) }
}

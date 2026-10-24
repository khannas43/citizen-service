// src/data/serviceCatalogue.js

function levenshtein(a, b) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 3) return 99
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = i
    for (let j = 1; j <= b.length; j++) {
      const curr = a[i - 1] === b[j - 1] ? dp[j - 1] : 1 + Math.min(dp[j], prev, dp[j - 1])
      dp[j - 1] = prev
      prev = curr
    }
    dp[b.length] = prev
  }
  return dp[b.length]
}

function getAge(dob) {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000))
}

function isFemale(gender) {
  if (!gender) return false
  const g = gender.toLowerCase()
  return g === 'female' || g === 'f'
}

function isFarmer(occupation) {
  if (!occupation) return false
  const o = occupation.toLowerCase()
  return o.includes('farm') || o.includes('kisan') || o.includes('agri') || o.includes('cultivat')
}

export const SERVICE_CATALOGUE = [
  {
    key: 'caste',
    name: 'Caste Certificate',
    nameGu: 'જ્ઞાતિ પ્રમાણ પત્ર',
    icon: '📜',
    desc: 'Official certificate for OBC, SC, ST & NT communities',
    route: '/apply/caf',
    synonyms: ['caste', 'category', 'obc', 'sc', 'st', 'nt', 'community', 'certificate', 'jati', 'જ્ઞાતિ', 'category proof', 'backward class'],
    profileMatch(profile, age) {
      const cat = profile?.casteCategory?.toUpperCase()
      if (['OBC', 'SC', 'ST', 'NT'].includes(cat)) {
        return { boost: 1.8, reason: 'Your caste category qualifies' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'marriage',
    name: 'Marriage Certificate',
    nameGu: 'લગ્ન પ્રમાણ પત્ર',
    icon: '💍',
    desc: 'Official registration of marriage',
    route: '/apply/caf',
    synonyms: ['marriage', 'wedding', 'vivah', 'lagna', 'nikah', 'spouse', 'couple', 'married', 'લગ્ન', 'marriage proof', 'register marriage'],
    profileMatch(profile, age) {
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'pension',
    name: 'Old Age Pension',
    nameGu: 'વૃદ્ધ પેન્શન',
    icon: '👴',
    desc: 'Monthly pension for senior citizens above 60',
    route: '/apply/caf',
    synonyms: ['pension', 'old age', 'senior', 'elderly', 'vriddh', 'vrudh', 'aged', '60 plus', 'retirement', 'age benefit', 'pensioner', 'વૃદ્ધ', 'pension yojana'],
    profileMatch(profile, age) {
      if (age !== null && age >= 60) {
        return { boost: 2.0, reason: 'Age 60+ qualifies for pension' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'familyMb',
    name: 'Family Member Change',
    nameGu: 'કુટુંબ સભ્ય ફેરફાર',
    icon: '👨‍👩‍👧',
    desc: 'Add or remove family members, name corrections',
    route: '/apply/caf',
    synonyms: ['family', 'member', 'add member', 'remove member', 'family update', 'family register', 'birth', 'death', 'name correction', 'family change', 'kutumb'],
    profileMatch(profile, age) {
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'old_age_pension_scheme',
    name: 'Old Age Pension Scheme',
    nameGu: 'વૃદ્ધ પેન્શન યોજના',
    icon: '🏦',
    desc: 'State scheme pension for senior citizens',
    route: '/apply/caf',
    synonyms: ['old age pension', 'pension', 'senior citizen', 'elderly', 'vriddh', 'age 60', 'government pension'],
    profileMatch(profile, age) {
      if (age !== null && age >= 60) {
        return { boost: 2.2, reason: 'Senior citizen pension scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'widow_pension',
    name: 'Widow Pension',
    nameGu: 'વિધવા પેન્શન',
    icon: '🕊️',
    desc: 'Monthly support for widowed women',
    route: '/apply/caf',
    synonyms: ['widow', 'widowed', 'vidhwa', 'widow pension', 'bereaved', 'husband died', 'single woman'],
    profileMatch(profile, age) {
      if (isFemale(profile?.gender)) {
        return { boost: 2.0, reason: "Women's welfare scheme" }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'bpl_ration',
    name: 'BPL Ration Card',
    nameGu: 'BPL રેશન કાર્ડ',
    icon: '🌾',
    desc: 'Below poverty line ration benefits',
    route: '/apply/caf',
    synonyms: ['bpl', 'ration', 'ration card', 'food', 'below poverty', 'antyodaya', 'subsidised food', 'rasan'],
    profileMatch(profile, age) {
      if (profile?.annualIncome != null && profile.annualIncome <= 150000) {
        return { boost: 1.5, reason: 'Income level qualifies for BPL' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'skill_dev',
    name: 'Skill Development Grant',
    nameGu: 'કૌશલ્ય વિકાસ',
    icon: '🎓',
    desc: 'Vocational training grant for youth aged 18-35',
    route: '/apply/caf',
    synonyms: ['skill', 'training', 'vocational', 'grant', 'youth', 'employment', 'job', 'kaushalya', 'diploma', 'certificate course'],
    profileMatch(profile, age) {
      if (age !== null && age >= 18 && age <= 35) {
        return { boost: 1.8, reason: 'Youth skill development eligibility' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'mudra',
    name: 'PM Mudra Yojana — Shishu',
    nameGu: 'PM મુદ્રા યોજના',
    icon: '💰',
    desc: 'Micro-enterprise loan up to ₹50,000',
    route: '/apply/caf',
    synonyms: ['mudra', 'loan', 'micro enterprise', 'small business', 'mudra yojana', 'self employment', 'business loan', 'shishu loan', 'startup'],
    profileMatch(profile, age) {
      if (age !== null && age >= 21 && age <= 55) {
        return { boost: 1.5, reason: 'Entrepreneurship loan scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'ayushman',
    name: 'Ayushman Gujarat',
    nameGu: 'આયુષ્માન ગુજરાત',
    icon: '🏥',
    desc: 'Health insurance up to ₹5 lakh per family',
    route: '/apply/caf',
    synonyms: ['ayushman', 'health', 'medical', 'insurance', 'hospital', 'treatment', 'health card', 'arogya', 'health scheme', 'pmjay'],
    profileMatch(profile, age) {
      return { boost: 1.3, reason: 'Universal health coverage available' }
    },
  },
  {
    key: 'pm_awas',
    name: 'PM Awas Yojana — Gramin',
    nameGu: 'PM આવાસ યોજના',
    icon: '🏠',
    desc: 'Rural housing scheme for economically weaker sections',
    route: '/apply/caf',
    synonyms: ['awas', 'housing', 'house', 'home', 'shelter', 'rural', 'gramin', 'pmay', 'pucca house', 'housing scheme', 'makan'],
    profileMatch(profile, age) {
      if (profile?.annualIncome != null && profile.annualIncome <= 150000) {
        return { boost: 1.6, reason: 'Eligible for housing assistance' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'matru_shakti',
    name: 'Matru Shakti Yojana',
    nameGu: 'માતૃ શક્તિ',
    icon: '👩‍🍼',
    desc: 'Maternal nutrition and health support',
    route: '/apply/caf',
    synonyms: ['matru', 'maternity', 'mother', 'pregnant', 'nutrition', 'maternal', 'shakti', 'delivery', 'pregnancy support', 'baby'],
    profileMatch(profile, age) {
      if (isFemale(profile?.gender) && age !== null && age >= 18 && age <= 45) {
        return { boost: 2.0, reason: 'Maternal health support scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'pm_kisan',
    name: 'PM Kisan Samman Nidhi',
    nameGu: 'PM કિસાન',
    icon: '🌱',
    desc: '₹6000/year income support for farmers',
    route: '/apply/caf',
    synonyms: ['kisan', 'farmer', 'agriculture', 'farm', 'pm kisan', 'kisaan', 'kheti', 'cultivation', 'crop', 'samman nidhi'],
    profileMatch(profile, age) {
      if (isFarmer(profile?.occupation)) {
        return { boost: 1.8, reason: 'Farmer income support scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'crop_loan',
    name: 'Crop Loan Interest Subsidy',
    nameGu: 'પાક ધિરાણ',
    icon: '🌾',
    desc: 'Interest subsidy on agricultural loans',
    route: '/apply/caf',
    synonyms: ['crop loan', 'agriculture loan', 'farm loan', 'kisan credit', 'interest subsidy', 'kheti loan', 'kharif', 'rabi'],
    profileMatch(profile, age) {
      if (isFarmer(profile?.occupation)) {
        return { boost: 1.8, reason: 'Agricultural credit scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'senior_health',
    name: 'Senior Citizen Health Card',
    nameGu: 'વૃદ્ધ આરોગ્ય',
    icon: '💊',
    desc: 'Free healthcare for senior citizens above 65',
    route: '/apply/caf',
    synonyms: ['senior health', 'old age health', 'health card', 'medical card', 'elderly health', 'geriatric', '65 plus', 'age health'],
    profileMatch(profile, age) {
      if (age !== null && age >= 65) {
        return { boost: 2.5, reason: 'Senior citizen healthcare scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'pre_matric',
    name: 'Pre-Matric SC/ST Scholarship',
    nameGu: 'પૂર્વ-મેટ્રિક શિષ્યવૃત્તિ',
    icon: '📚',
    desc: 'Scholarship for SC/ST students class 6-10',
    route: '/apply/caf',
    synonyms: ['scholarship', 'pre matric', 'sc scholarship', 'st scholarship', 'school scholarship', 'student', 'class 6', 'class 10', 'education', 'vidyarthi', 'shishyavritti'],
    profileMatch(profile, age) {
      const cat = profile?.casteCategory?.toUpperCase()
      if (['SC', 'ST'].includes(cat)) {
        return { boost: 2.0, reason: 'SC/ST scholarship available' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'post_matric',
    name: 'Post-Matric OBC Scholarship',
    nameGu: 'ઉત્તર-મેટ્રિક OBC શિષ્યવૃત્તિ',
    icon: '🎓',
    desc: 'Scholarship for OBC students in higher education',
    route: '/apply/caf',
    synonyms: ['scholarship', 'post matric', 'obc scholarship', 'college scholarship', 'higher education', 'degree', 'university', 'student', 'obc student', 'vidyarthi'],
    profileMatch(profile, age) {
      if (profile?.casteCategory?.toUpperCase() === 'OBC') {
        return { boost: 2.0, reason: 'OBC higher education scholarship' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'cm_girl_child',
    name: 'CM Girl Child Education Grant',
    nameGu: 'CM બાળ શિક્ષણ',
    icon: '👧',
    desc: 'Education support grant for girl children',
    route: '/apply/caf',
    synonyms: ['girl child', 'girl education', 'daughter', 'kanya', 'ladki', 'cm scheme', 'girl scholarship', 'beti', 'female education'],
    profileMatch(profile, age) {
      if (isFemale(profile?.gender)) {
        return { boost: 1.8, reason: 'Girl child education scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'gruh_sudhara',
    name: 'Mukhyamantri Gruh Sudhara',
    nameGu: 'ગૃહ સુધારા',
    icon: '🏗️',
    desc: 'Home renovation grant for SC/ST families',
    route: '/apply/caf',
    synonyms: ['house repair', 'gruh sudhara', 'renovation', 'home improvement', 'repair grant', 'sc st housing', 'home grant'],
    profileMatch(profile, age) {
      const cat = profile?.casteCategory?.toUpperCase()
      if (['SC', 'ST'].includes(cat)) {
        return { boost: 1.8, reason: 'SC/ST home improvement scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'anganwadi',
    name: 'Anganwadi Nutrition Scheme',
    nameGu: 'આંગણવાડી',
    icon: '🍽️',
    desc: 'Child nutrition support through anganwadi centres',
    route: '/apply/caf',
    synonyms: ['anganwadi', 'nutrition', 'child nutrition', 'baby food', 'malnutrition', 'icds', 'child health', 'poshan'],
    profileMatch(profile, age) {
      return { boost: 1.5, reason: 'Child nutrition support available' }
    },
  },
  {
    key: 'tribal_hostel',
    name: 'Tribal Student Hostel Allowance',
    nameGu: 'આદિવાસી છાત્રાલય',
    icon: '🏫',
    desc: 'Hostel and stipend for ST students',
    route: '/apply/caf',
    synonyms: ['tribal', 'hostel', 'st student', 'adivasi', 'tribal scholarship', 'hostel allowance', 'tribal education'],
    profileMatch(profile, age) {
      if (profile?.casteCategory?.toUpperCase() === 'ST') {
        return { boost: 2.2, reason: 'ST tribal education scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'kishori',
    name: 'Kishori Shakti Yojana',
    nameGu: 'કિશોરી શક્તિ',
    icon: '👧‍🎓',
    desc: 'Adolescent girl empowerment programme',
    route: '/apply/caf',
    synonyms: ['kishori', 'adolescent girl', 'teenage girl', 'girl empowerment', 'kishore', 'shakti', 'girl scheme', 'adolescent'],
    profileMatch(profile, age) {
      if (isFemale(profile?.gender)) {
        return { boost: 2.0, reason: 'Adolescent girl welfare scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'kisan_bima',
    name: 'Kisan Suraksha Bima',
    nameGu: 'કિસાન સુરક્ષા',
    icon: '🛡️',
    desc: 'Accident insurance for farmers',
    route: '/apply/caf',
    synonyms: ['kisan bima', 'farmer insurance', 'accident insurance', 'suraksha bima', 'farm insurance', 'agricultural insurance'],
    profileMatch(profile, age) {
      if (isFarmer(profile?.occupation)) {
        return { boost: 1.8, reason: 'Farmer insurance scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
  {
    key: 'mahila_udyog',
    name: 'Mahila Udyog Loan Scheme',
    nameGu: 'મહિલા ઉદ્યોગ',
    icon: '👩‍💼',
    desc: 'Entrepreneurship loan for women up to ₹2 lakh',
    route: '/apply/caf',
    synonyms: ['mahila', 'women loan', 'women entrepreneur', 'woman business', 'self help group', 'shg', 'udyog loan', 'female entrepreneur'],
    profileMatch(profile, age) {
      if (isFemale(profile?.gender)) {
        return { boost: 2.0, reason: 'Women entrepreneurship scheme' }
      }
      return { boost: 1.0, reason: null }
    },
  },
]

/**
 * Search services by query string, optionally boosted by user profile.
 * Returns top 6 results as { service, score, profileReason }.
 */
export function searchServices(query, profile) {
  if (!query || query.length < 2) return []

  const q = query.toLowerCase().trim()
  const age = getAge(profile?.dob)

  const scored = SERVICE_CATALOGUE.map((service) => {
    const { boost, reason } = service.profileMatch(profile, age)

    // Base text score
    let textScore = 0

    // Exact / substring match on name
    const nameLower = service.name.toLowerCase()
    const nameGuLower = service.nameGu.toLowerCase()
    if (nameLower === q || nameGuLower === q) {
      textScore = 10
    } else if (nameLower.includes(q) || nameGuLower.includes(q)) {
      textScore = 6
    } else {
      // Check synonyms for exact or substring match
      let synScore = 0
      for (const syn of service.synonyms) {
        if (syn === q) { synScore = Math.max(synScore, 5); break }
        if (syn.includes(q) || q.includes(syn)) { synScore = Math.max(synScore, 3) }
        // Fuzzy: levenshtein per word token
        const dist = levenshtein(q, syn)
        if (dist <= 2) synScore = Math.max(synScore, 2 - dist * 0.5)
      }
      // Also fuzzy against name words
      const nameWords = nameLower.split(/\s+/)
      for (const word of nameWords) {
        if (word.length >= 3) {
          const dist = levenshtein(q, word)
          if (dist <= 2) synScore = Math.max(synScore, 2 - dist * 0.5)
        }
      }
      textScore = synScore
    }

    if (textScore <= 0) return null

    const score = textScore * boost
    const profileReason = boost > 1.0 ? reason : null

    return { service, score, profileReason }
  }).filter(Boolean)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 6)
}

/**
 * Get profile-based scheme recommendations, excluding already-enrolled schemes.
 * Returns top 4 as { service, reason }.
 */
export function getProfileRecommendations(profile, enrolledSchemeNames = []) {
  const age = getAge(profile?.dob)

  const scored = SERVICE_CATALOGUE.map((service) => {
    const { boost, reason } = service.profileMatch(profile, age)
    if (boost <= 1.2) return null
    if (enrolledSchemeNames.includes(service.name)) return null
    return { service, boost, reason }
  }).filter(Boolean)

  scored.sort((a, b) => b.boost - a.boost)
  return scored.slice(0, 4).map(({ service, reason }) => ({ service, reason }))
}

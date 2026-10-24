export const CATEGORY_META = {
  EDUCATION: { label: 'Education Scholarship', icon: '🎓', color: '#1e40af' },
  SENIOR_CITIZEN: { label: 'Senior Citizen Welfare', icon: '👴', color: '#7c3aed' },
  WOMEN_EMPOWERMENT: { label: 'Women Empowerment', icon: '👩', color: '#be185d' },
  CHILD_WELFARE: { label: 'Child Welfare', icon: '👶', color: '#059669' },
  AGRICULTURE: { label: 'Agriculture Support', icon: '🌾', color: '#d97706' },
  LIVELIHOOD: { label: 'Livelihood & Skill', icon: '💼', color: '#0891b2' },
  HOUSING: { label: 'Housing', icon: '🏠', color: '#64748b' },
  HEALTH: { label: 'Health & Medical', icon: '🏥', color: '#dc2626' },
  OTHER: { label: 'Other / General', icon: '📋', color: '#6b7280' },
}

export function categoryLabel(key) {
  return CATEGORY_META[key]?.label ?? key?.replace(/_/g, ' ') ?? 'Other'
}

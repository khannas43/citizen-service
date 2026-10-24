import { describe, expect, it } from 'vitest'
import {
  districtForOfficer,
  extractOfficerRole,
  filterTasksByRole,
  matchesOfficerDistrict,
  normalizeOfficerRole,
  officerCanAccessPath,
  officerHasFeature,
  officerLandingPath,
  officerNavItems,
} from './auth.js'

const queue = [
  {
    service: 'Caste Certificate',
    applicantName: 'Priya Patel',
    currentTask: 'Talati Verification',
    assignee: null,
    candidateGroups: 'talati',
  },
  {
    service: 'Caste Certificate',
    applicantName: 'Shreya Patel',
    currentTask: 'Data Entry Officer Review',
    assignee: 'data-entry-officer',
    candidateGroups: null,
  },
  {
    service: 'Pension',
    applicantName: 'Savitaben Patel',
    currentTask: 'Revenue Officer Verification',
    assignee: 'revenue-officer',
    candidateGroups: null,
  },
  {
    service: 'Family Member Change',
    applicantName: 'Newborn Patel',
    currentTask: 'Talati Verification',
    assignee: 'talati',
    candidateGroups: 'talati',
  },
  {
    service: 'Scheme Application',
    applicantName: 'Priya Patel',
    currentTask: 'Income Verification Officer',
    assignee: 'income-officer',
    candidateGroups: null,
  },
  {
    service: 'Marriage Certificate',
    applicantName: 'Rajan Nair',
    currentTask: 'Pending Approval',
    assignee: null,
    candidateGroups: 'MARRIAGE_APPROVER',
  },
]

describe('normalizeOfficerRole', () => {
  it('maps login aliases to canonical roles', () => {
    expect(normalizeOfficerRole('talati')).toBe('TALATI')
    expect(normalizeOfficerRole('mamlatdar')).toBe('TALATI')
    expect(normalizeOfficerRole('data.entry')).toBe('DATA_ENTRY_OFFICER')
    expect(normalizeOfficerRole('revenue')).toBe('REVENUE_OFFICER')
    expect(normalizeOfficerRole('dept.admin')).toBe('DEPT_ADMIN')
  })
})

describe('extractOfficerRole', () => {
  it('prefers a canonical realm role', () => {
    expect(extractOfficerRole({ realm_access: { roles: ['offline_access', 'TALATI'] } })).toBe('TALATI')
  })

  it('maps mamlatdar alias from the token', () => {
    expect(extractOfficerRole({ realm_access: { roles: ['MAMLATDAR'] } })).toBe('TALATI')
  })
})

describe('filterTasksByRole', () => {
  it('keeps talati work even when only the task name matches', () => {
    const names = filterTasksByRole(queue, 'TALATI').map((t) => t.applicantName)
    expect(names).toEqual(['Priya Patel', 'Newborn Patel'])
  })

  it('keeps data-entry work from assignee or current task', () => {
    const names = filterTasksByRole(queue, 'DATA_ENTRY_OFFICER').map((t) => t.applicantName)
    expect(names).toEqual(['Shreya Patel'])
  })

  it('keeps revenue work from assignee or current task', () => {
    const names = filterTasksByRole(queue, 'revenue').map((t) => t.applicantName)
    expect(names).toEqual(['Savitaben Patel'])
  })

  it('keeps scheme applications for scheme dept regardless of assignee', () => {
    expect(filterTasksByRole(queue, 'SCHEME_DEPT')).toHaveLength(1)
  })

  it('shows the full queue for dept admin', () => {
    expect(filterTasksByRole(queue, 'DEPT_ADMIN')).toHaveLength(queue.length)
  })

  it('hides the queue for an unrecognized role', () => {
    expect(filterTasksByRole(queue, 'UNKNOWN')).toHaveLength(0)
  })
})

describe('officerHasFeature', () => {
  it('gives talati grievances and family lookup, not coverage or schemes', () => {
    expect(officerHasFeature('TALATI', 'tasks')).toBe(true)
    expect(officerHasFeature('TALATI', 'grievances')).toBe(true)
    expect(officerHasFeature('TALATI', 'families')).toBe(true)
    expect(officerHasFeature('TALATI', 'coverage')).toBe(false)
    expect(officerHasFeature('TALATI', 'schemes')).toBe(false)
    expect(officerHasFeature('TALATI', 'reports')).toBe(false)
    expect(officerHasFeature('mamlatdar', 'families')).toBe(true)
  })

  it('gives scheme dept coverage, reports, and family registry', () => {
    expect(officerHasFeature('SCHEME_DEPT', 'tasks')).toBe(true)
    expect(officerHasFeature('SCHEME_DEPT', 'grievances')).toBe(true)
    expect(officerHasFeature('SCHEME_DEPT', 'schemes')).toBe(true)
    expect(officerHasFeature('SCHEME_DEPT', 'coverage')).toBe(true)
    expect(officerHasFeature('SCHEME_DEPT', 'simulator')).toBe(true)
    expect(officerHasFeature('SCHEME_DEPT', 'reports')).toBe(true)
    expect(officerHasFeature('SCHEME_DEPT', 'families')).toBe(true)
    expect(officerHasFeature('SCHEME_DEPT', 'fraud')).toBe(false)
    expect(officerHasFeature('SCHEME_DEPT', 'schemeContent')).toBe(true)
    expect(officerHasFeature('IT_ADMIN', 'schemeContent')).toBe(false)
    expect(officerCanAccessPath('IT_ADMIN', '/scheme-content')).toBe(false)
    expect(officerCanAccessPath('SCHEME_DEPT', '/scheme-content')).toBe(true)
  })

  it('blocks talati from coverage and allows scheme dept family registry by path', () => {
    expect(officerCanAccessPath('TALATI', '/coverage')).toBe(false)
    expect(officerCanAccessPath('TALATI', '/tasks')).toBe(true)
    expect(officerCanAccessPath('SCHEME_DEPT', '/families')).toBe(true)
    expect(officerCanAccessPath('SCHEME_DEPT', '/coverage')).toBe(true)
    expect(officerCanAccessPath('TALATI', '/form-definitions')).toBe(true)
  })

  it('lists only allowed sidebar items for talati and scheme dept', () => {
    const talati = officerNavItems('TALATI').map((i) => i.to)
    expect(talati).toEqual(['/', '/tasks', '/grievances', '/families'])
    const dept = officerNavItems('SCHEME_DEPT').map((i) => i.to)
    expect(dept).toEqual([
      '/', '/tasks', '/grievances', '/schemes', '/scheme-content', '/beneficiaries',
      '/scheme-simulator', '/money-overview', '/expenditure-integrity', '/coverage', '/families', '/analytics', '/reports',
    ])
  })

  it('keeps Data and Guided Story off the sidebar but gated by path for admins', () => {
    expect(officerNavItems('DEPT_ADMIN').map((i) => i.to)).toEqual([
      '/', '/tasks', '/grievances', '/schemes', '/scheme-content', '/beneficiaries', '/scheme-simulator',
      '/money-overview', '/expenditure-integrity', '/fraud-signals/legacy', '/coverage', '/families',
      '/analytics', '/reports',
    ])
    expect(officerNavItems('IT_ADMIN').map((i) => i.to)).toEqual([
      '/', '/ops-dashboard', '/money-overview', '/expenditure-integrity', '/analytics', '/reports',
    ])
    expect(officerCanAccessPath('DEPT_ADMIN', '/story')).toBe(true)
    expect(officerCanAccessPath('SCHEME_DEPT', '/story')).toBe(true)
    expect(officerHasFeature('SCHEME_DEPT', 'dataImport')).toBe(false)
    expect(officerCanAccessPath('SCHEME_DEPT', '/data')).toBe(false)
    expect(officerCanAccessPath('DEPT_ADMIN', '/data')).toBe(true)
  })

  it('gates the legacy scheme-overlap screen by role and lists it in the sidebar', () => {
    expect(officerCanAccessPath('REVENUE_OFFICER', '/fraud-signals/legacy')).toBe(true)
    expect(officerCanAccessPath('DEPT_ADMIN', '/fraud-signals/legacy')).toBe(true)
    for (const role of ['TALATI', 'SCHEME_DEPT', 'IT_ADMIN', 'DATA_ENTRY_OFFICER', 'SENIOR_MGMT']) {
      expect(officerCanAccessPath(role, '/fraud-signals/legacy')).toBe(false)
    }
    expect(officerNavItems('REVENUE_OFFICER').map((i) => i.to)).toContain('/fraud-signals/legacy')
    expect(officerNavItems('SCHEME_DEPT').map((i) => i.to)).not.toContain('/fraud-signals/legacy')
  })

  it('gives the payroll and finance roles Expenditure Integrity and nothing else sensitive', () => {
    for (const role of ['PAYROLL_REVIEWER', 'FINANCE_OFFICER', 'HR_OFFICER']) {
      expect(officerHasFeature(role, 'expenditureIntegrity')).toBe(true)
      expect(officerNavItems(role).map((i) => i.to)).toEqual(['/', '/expenditure-integrity'])
      for (const feature of ['schemes', 'beneficiaries', 'families', 'tasks']) expect(officerHasFeature(role, feature)).toBe(false)
    }
  })

  it('shows Expenditure Integrity to the roles that review or operate it, and to nobody else', () => {
    for (const role of ['SCHEME_DEPT', 'DEPT_ADMIN', 'REVENUE_OFFICER', 'IT_ADMIN']) {
      expect(officerHasFeature(role, 'expenditureIntegrity')).toBe(true)
      expect(officerCanAccessPath(role, '/expenditure-integrity')).toBe(true)
    }
    for (const role of ['TALATI', 'DATA_ENTRY_OFFICER', 'SENIOR_MGMT']) {
      expect(officerHasFeature(role, 'expenditureIntegrity')).toBe(false)
      expect(officerCanAccessPath(role, '/expenditure-integrity')).toBe(false)
    }
  })

  it('gives senior management the money overview, coverage, analytics, and reports only', () => {
    expect(officerHasFeature('SENIOR_MGMT', 'analytics')).toBe(true)
    expect(officerHasFeature('SENIOR_MGMT', 'reports')).toBe(true)
    expect(officerHasFeature('SENIOR_MGMT', 'coverage')).toBe(true)
    expect(officerHasFeature('SENIOR_MGMT', 'tasks')).toBe(false)
    expect(officerHasFeature('SENIOR_MGMT', 'families')).toBe(false)
    expect(officerHasFeature('SENIOR_MGMT', 'schemes')).toBe(false)
    expect(officerCanAccessPath('SENIOR_MGMT', '/analytics')).toBe(true)
    expect(officerCanAccessPath('SENIOR_MGMT', '/tasks')).toBe(false)
    expect(officerLandingPath('SENIOR_MGMT')).toBe('/analytics')
    expect(officerLandingPath('TALATI')).toBe('/')
    expect(officerNavItems('SENIOR_MGMT').map((i) => i.to)).toEqual([
      '/money-overview', '/coverage', '/analytics', '/reports',
    ])
  })
})

describe('districtForOfficer', () => {
  it('locks scheme department to Ahmedabad', () => {
    expect(districtForOfficer('scheme.dept', 'SCHEME_DEPT')).toBe('Ahmedabad')
    expect(districtForOfficer('scheme.dept', null)).toBe('Ahmedabad')
  })

  it('does not lock statewide admin roles', () => {
    expect(districtForOfficer('admin', 'DEPT_ADMIN')).toBeNull()
    expect(districtForOfficer('it.admin', 'IT_ADMIN')).toBeNull()
    expect(districtForOfficer('senior.mgmt', 'SENIOR_MGMT')).toBeNull()
    expect(districtForOfficer('talati', 'TALATI')).toBeNull()
  })

  it('matches district names case-insensitively', () => {
    expect(matchesOfficerDistrict('Ahmedabad', 'Ahmedabad')).toBe(true)
    expect(matchesOfficerDistrict('ahmedabad', 'Ahmedabad')).toBe(true)
    expect(matchesOfficerDistrict('Surat', 'Ahmedabad')).toBe(false)
    expect(matchesOfficerDistrict('Surat', null)).toBe(true)
  })
})

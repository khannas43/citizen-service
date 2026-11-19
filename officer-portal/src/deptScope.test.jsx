import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import {
  OFFICER_ROLES,
  normalizeOfficerRole,
  officerHasFeature,
  officerCanAccessPath,
  officerLandingPath,
  officerNavItems,
} from './auth'
import { buildNav } from './navTree'

vi.mock('./mdmApi', () => ({
  mdm: vi.fn(),
  MDM_API: '',
}))

vi.mock('./screens/mdm/shared', async () => {
  const actual = await vi.importActual('./screens/mdm/shared')
  return {
    ...actual,
    useMdm: vi.fn(() => ({ data: { groups: [] }, error: null, loading: false, reload: vi.fn() })),
  }
})

import { mdm } from './mdmApi'
import DxWork from './screens/dx/DxWork'

describe('department roles (PDS_OFFICER / HEALTH_OFFICER)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('are recognised officer roles with aliases', () => {
    expect(OFFICER_ROLES).toContain('PDS_OFFICER')
    expect(OFFICER_ROLES).toContain('HEALTH_OFFICER')
    expect(normalizeOfficerRole('PDS')).toBe('PDS_OFFICER')
    expect(normalizeOfficerRole('HEALTH')).toBe('HEALTH_OFFICER')
    expect(normalizeOfficerRole('PDS_OFFICER')).toBe('PDS_OFFICER')
  })

  it('menu for each department role is only Control Tower and Decisions', () => {
    for (const role of ['PDS_OFFICER', 'HEALTH_OFFICER']) {
      expect(officerHasFeature(role, 'mdmDept')).toBe(true)
      expect(officerHasFeature(role, 'mdm')).toBe(false)
      const paths = officerNavItems(role).map((i) => i.to)
      expect(paths).toEqual(expect.arrayContaining([
        '/dx/control', '/dx/work', '/dx/approvals', '/dx/consent', '/dx/notices',
      ]))
      expect(paths).not.toContain('/mdm')
      expect(paths).not.toContain('/dx/events')
      expect(paths).not.toContain('/dx/policy')
      expect(paths).not.toContain('/dx/scenarios')
      expect(paths).not.toContain('/tasks')
      const entries = buildNav(officerNavItems(role))
      const groups = entries.filter((e) => e.group).map((e) => e.group)
      expect(groups.every((g) => g === 'Data Exchange')).toBe(true)
      const labels = entries.flatMap((e) => (e.group ? e.all : [e.item]).map((i) => i.label))
      expect(labels.some((l) => /Control Tower/i.test(l))).toBe(true)
      expect(labels.some((l) => /Decisions/i.test(l))).toBe(true)
    }
  })

  it('typing another /dx/* or /mdm address is refused', () => {
    for (const role of ['PDS_OFFICER', 'HEALTH_OFFICER']) {
      expect(officerCanAccessPath(role, '/mdm')).toBe(false)
      expect(officerCanAccessPath(role, '/dx/events')).toBe(false)
      expect(officerCanAccessPath(role, '/dx/policy')).toBe(false)
      expect(officerCanAccessPath(role, '/dx/story')).toBe(false)
      expect(officerCanAccessPath(role, '/dx/quality')).toBe(false)
      expect(officerCanAccessPath(role, '/dx/control')).toBe(true)
      expect(officerCanAccessPath(role, '/dx/work')).toBe(true)
      expect(officerCanAccessPath(role, '/dx/control?tab=overview')).toBe(false)
    }
  })

  it('a department user can open a Work queue group page but nothing deeper or elsewhere', () => {
    for (const role of ['PDS_OFFICER', 'HEALTH_OFFICER']) {
      expect(officerCanAccessPath(role, '/dx/work/BIRTH_CLEAN')).toBe(true)
      expect(officerCanAccessPath(role, '/dx/work/BIRTH_CLEAN?system=pds')).toBe(true)
      expect(officerCanAccessPath(role, '/dx/work/BIRTH_CLEAN/extra')).toBe(false)
      expect(officerCanAccessPath(role, '/dx/workbench')).toBe(false)
      expect(officerCanAccessPath(role, '/dx/ledger')).toBe(false)
      expect(officerCanAccessPath(role, '/dx/policy')).toBe(false)
    }
  })

  it('the group page URL for another department still loads only the user department on the API', async () => {
    localStorage.setItem('officer_role', 'PDS_OFFICER')
    vi.mocked(mdm).mockResolvedValue({ items: [], next_after: null, label: 'Birth', risk_class: 'B', batchable: true })
    render(
      <MemoryRouter initialEntries={['/dx/work/BIRTH_CLEAN?system=health']}>
        <Routes>
          <Route path="/dx/work/:reason" element={<DxWork />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(mdm).toHaveBeenCalled())
    const call = vi.mocked(mdm).mock.calls.find((c) => c[0] === '/x/work/items')
    expect(call).toBeTruthy()
    expect(call[1].params.system).toBe('pds')
    expect(call[1].params.system).not.toBe('health')
  })

  it('landing path is Work queue for PDS and Flow board for Health', () => {
    expect(officerLandingPath('PDS_OFFICER')).toBe('/dx/work')
    expect(officerLandingPath('HEALTH_OFFICER')).toBe('/dx/control')
  })

  it('department helpers expose the display name', async () => {
    const { departmentForRole, departmentLabel } = await import('./auth')
    expect(departmentForRole('PDS_OFFICER')).toBe('pds')
    expect(departmentForRole('HEALTH_OFFICER')).toBe('health')
    expect(departmentLabel('PDS_OFFICER')).toBe('Civil supplies (PDS)')
    expect(departmentLabel('HEALTH_OFFICER')).toBe('Health')
  })
})

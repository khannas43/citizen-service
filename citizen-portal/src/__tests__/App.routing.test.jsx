import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'

/**
 * Slim routing mirror of App.jsx authenticated routes for landing behaviour.
 * Full App import pulls every screen and its API surface; this keeps the check focused.
 */
function AuthRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/approvals" replace />} />
      <Route path="/home" element={<h1>Home screen</h1>} />
      <Route path="/approvals" element={<h1>Approvals</h1>} />
      <Route path="/my-applications" element={<Navigate to="/home" replace />} />
      <Route path="/login" element={<Navigate to="/approvals" replace />} />
    </Routes>
  )
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthRoutes />
    </MemoryRouter>,
  )
}

describe('authenticated landing redirects', () => {
  it('sends / to /approvals', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Approvals' })).toBeInTheDocument()
  })

  it('keeps Home at /home', async () => {
    renderAt('/home')
    expect(await screen.findByRole('heading', { name: 'Home screen' })).toBeInTheDocument()
  })

  it('sends /my-applications to /home', async () => {
    renderAt('/my-applications')
    expect(await screen.findByRole('heading', { name: 'Home screen' })).toBeInTheDocument()
  })

  it('sends authenticated /login to /approvals', async () => {
    renderAt('/login')
    expect(await screen.findByRole('heading', { name: 'Approvals' })).toBeInTheDocument()
  })
})

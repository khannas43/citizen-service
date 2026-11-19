import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { Mt, Tel, Nm, Pl, Name, _resetForTests } from './mt'
import { setLang } from './lang'

const json = (data) => ({ ok: true, status: 200, json: async () => data })
beforeEach(() => { localStorage.setItem('officer_token', 'tok'); _resetForTests() })
afterEach(() => { cleanup(); setLang('en') })

describe('Machine-translated department text', () => {
  it('shows the English text untouched in English, without calling the service', () => {
    globalThis.fetch = vi.fn()
    render(<p><Mt text="Record not found at the source" /></p>)
    expect(screen.getByText('Record not found at the source')).toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('shows the Telugu translation with a machine-translated mark when the service is on', async () => {
    setLang('te')
    globalThis.fetch = vi.fn(async (url) => String(url).includes('/status') ? json({ enabled: true, languages: ['te'] })
      : json({ enabled: true, items: [{ text: 'Record not found', translated: 'రికార్డు దొరకలేదు', machine: true }] }))
    render(<p data-testid="p"><Mt text="Record not found" /></p>)
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('రికార్డు దొరకలేదు'))
    expect(screen.getByTestId('p')).toHaveTextContent('యంత్ర అనువాదం')
  })

  it('keeps the English text when the service is off or fails', async () => {
    setLang('te')
    globalThis.fetch = vi.fn(async () => json({ enabled: false, languages: [] }))
    render(<p data-testid="p"><Mt text="Record not found" /></p>)
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(screen.getByTestId('p')).toHaveTextContent('Record not found')
    expect(screen.getByTestId('p')).not.toHaveTextContent('యంత్ర')
  })

  it('shows reviewer-checked text plainly, with no machine mark', async () => {
    setLang('te')
    globalThis.fetch = vi.fn(async (url) => String(url).includes('/status') ? json({ enabled: true, languages: ['te'] })
      : json({ enabled: true, items: [{ text: 'Notice acknowledged', translated: 'నోటీసు అందింది', machine: false, reviewed: true }] }))
    render(<p data-testid="p"><Mt text="Notice acknowledged" /></p>)
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('నోటీసు అందింది'))
    expect(screen.getByTestId('p')).not.toHaveTextContent('యంత్ర')
  })

  it('shows district names from the fixed list without calling the service, and a Telugu name already on the record as is', async () => {
    setLang('te')
    globalThis.fetch = vi.fn(async () => json({ enabled: true, languages: ['te'] }))
    render(<p data-testid="p"><Pl parts={[null, null, 'Kamareddy']} /> <Tel text="A. Ankam" local="ఎ. అంకం" /></p>)
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('కామారెడ్డి'))
    expect(screen.getByTestId('p')).toHaveTextContent('ఎ. అంకం')
    expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/x/translate') && !String(u).includes('/status'))).toBe(false)
  })

  it('adds a machine-written Telugu spelling beside an English name, and nothing in English', async () => {
    globalThis.fetch = vi.fn(async (url) => String(url).includes('/status') ? json({ enabled: true, languages: ['te'] })
      : json({ enabled: true, items: [{ text: 'Ravi Kumar', translated: 'రవి కుమార్', machine: true, reviewed: false }] }))
    setLang('en')
    const { rerender } = render(<p data-testid="p">Ravi Kumar<Tel text="Ravi Kumar" /></p>)
    expect(screen.getByTestId('p').textContent).toBe('Ravi Kumar')
    setLang('te')
    rerender(<p data-testid="p">Ravi Kumar<Tel text="Ravi Kumar" /></p>)
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('Ravi Kumar · రవి కుమార్'))
  })

  it('leaves an unknown place as given when the service is off', async () => {
    setLang('te')
    globalThis.fetch = vi.fn(async () => json({ enabled: false, languages: [] }))
    render(<p data-testid="p"><Nm text="Somewhere" /></p>)
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(screen.getByTestId('p')).toHaveTextContent('Somewhere')
  })

  it('puts the Telugu spelling first and the English name after it in the Telugu view', async () => {
    globalThis.fetch = vi.fn(async (url) => String(url).includes('/status') ? json({ enabled: true, languages: ['te'] })
      : json({ enabled: true, items: [{ text: 'Abdul Ansari', translated: 'అబ్దుల్ అన్సారీ', machine: true, reviewed: false }] }))
    setLang('en')
    const { rerender } = render(<p data-testid="p"><Name text="Abdul Ansari" /></p>)
    expect(screen.getByTestId('p').textContent).toBe('Abdul Ansari')
    setLang('te')
    rerender(<p data-testid="p"><Name text="Abdul Ansari" /></p>)
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('అబ్దుల్ అన్సారీ · Abdul Ansari'))
  })
})


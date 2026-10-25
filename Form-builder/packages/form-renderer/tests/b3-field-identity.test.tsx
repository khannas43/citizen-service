import { render } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { FormRenderer } from '../src/FormRenderer.js'
import { createSamplePublishedDefinition } from './fixtures.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

describe('FB-B3 FormRenderer DOM id isolation', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('FormRenderer must not call fetch')
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('keeps DOM ids unique across two FormRenderer instances', () => {
    const definition = createSamplePublishedDefinition()
    const { container } = render(
      <div>
        <FormRenderer definition={definition} mode="citizen" />
        <FormRenderer definition={definition} mode="citizen" />
      </div>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

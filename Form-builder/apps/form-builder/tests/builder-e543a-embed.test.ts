import { describe, expect, it, vi } from 'vitest'

describe('FB-E5.4.3A embed entry', () => {
  it('exports BuilderShell without mounting or touching storage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    const mod = await import('../src/embed.ts')
    expect(typeof mod.BuilderShell).toBe('function')
    expect(document.querySelector('.dg20-builder-app')).toBeNull()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()

    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('exposes only the stable embed surface', async () => {
    const embed = await import('../src/embed.ts')
    expect(Object.keys(embed).sort()).toEqual(['BuilderShell'])
  })
})

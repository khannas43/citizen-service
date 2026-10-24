import { within } from '@testing-library/react'

/** Canvas pane root (throws if missing). */
export function canvasRoot(): HTMLElement {
  const el = document.querySelector('.dg20-builder-canvas')
  if (!(el instanceof HTMLElement)) {
    throw new Error('canvas root missing')
  }
  return el
}

/** Selection rows only — excludes reorder handles and insertion markers. */
export function canvasRowButtons(): HTMLElement[] {
  return Array.from(canvasRoot().querySelectorAll<HTMLElement>('.dg20-builder-canvas__row'))
}

/**
 * Find a canvas selection row by accessible name.
 * Reorder handles also mention the field label; never match those.
 */
export function getCanvasRowByName(name: string | RegExp): HTMLElement {
  return within(canvasRoot()).getByRole('button', {
    name: (accessibleName, element) => {
      if (!(element instanceof HTMLElement)) return false
      if (!element.classList.contains('dg20-builder-canvas__row')) return false
      return typeof name === 'string'
        ? new RegExp(name, 'i').test(accessibleName)
        : name.test(accessibleName)
    },
  })
}

export function queryCanvasRowByName(name: string | RegExp): HTMLElement | null {
  return within(canvasRoot()).queryByRole('button', {
    name: (accessibleName, element) => {
      if (!(element instanceof HTMLElement)) return false
      if (!element.classList.contains('dg20-builder-canvas__row')) return false
      return typeof name === 'string'
        ? new RegExp(name, 'i').test(accessibleName)
        : name.test(accessibleName)
    },
  })
}

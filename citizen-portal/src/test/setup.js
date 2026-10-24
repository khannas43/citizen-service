import '@testing-library/jest-dom/vitest'
import { expect } from 'vitest'
import * as matchers from 'vitest-axe/matchers'
import i18n from '../i18n'

expect.extend(matchers)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  localStorage.clear()
  sessionStorage.clear()
})

// Test-only canvas stub — silences jsdom axe color-contrast probe warning.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
    }
  }
}

// Test-only: jsdom does not implement getComputedStyle for pseudo-elements.
const originalGetComputedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = function getComputedStyle(elt, pseudoElt) {
  if (pseudoElt) {
    return {
      getPropertyValue: () => '',
      length: 0,
    }
  }
  return originalGetComputedStyle(elt)
}

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from 'vitest-axe/matchers'
import { afterEach, expect, vi } from 'vitest'

expect.extend(matchers)

// axe color-contrast probes canvas; jsdom does not implement getContext.
HTMLCanvasElement.prototype.getContext = vi.fn(
  () => null,
) as unknown as typeof HTMLCanvasElement.prototype.getContext

afterEach(() => {
  cleanup()
})

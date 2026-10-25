import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packagesDir = path.resolve(rootDir, 'packages')

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Exact package-root matches only — preserve CSS subpath exports.
    alias: [
      {
        find: /^@citizen\/form-contract$/,
        replacement: path.join(packagesDir, 'form-contract/src/index.ts'),
      },
      {
        find: /^@citizen\/form-widgets$/,
        replacement: path.join(packagesDir, 'form-widgets/src/index.ts'),
      },
      {
        find: /^@citizen\/form-renderer$/,
        replacement: path.join(packagesDir, 'form-renderer/src/index.ts'),
      },
    ],
  },
  test: {
    include: [
      'packages/*/tests/**/*.{test,spec}.{ts,tsx}',
      'apps/*/tests/**/*.{test,spec}.{ts,tsx}',
      'scripts/**/*.{test,spec}.{js,mjs,ts}',
    ],
    environment: 'jsdom',
    setupFiles: ['./packages/form-widgets/tests/setup.ts'],
    css: true,
  },
})

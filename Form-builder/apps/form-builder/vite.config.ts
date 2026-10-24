import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packagesDir = path.resolve(rootDir, '../../packages')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '')
  const formDefinitionServiceTarget =
    env.VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET?.trim() || 'http://localhost:8080'

  return {
    plugins: [react()],
    resolve: {
      // Exact package-root matches only — do not intercept
      // `@dg20/form-widgets/styles/*.css` or other subpath exports.
      alias: [
        {
          find: /^@dg20\/form-contract$/,
          replacement: path.join(packagesDir, 'form-contract/src/index.ts'),
        },
        {
          find: /^@dg20\/form-widgets$/,
          replacement: path.join(packagesDir, 'form-widgets/src/index.ts'),
        },
        {
          find: /^@dg20\/form-renderer$/,
          replacement: path.join(packagesDir, 'form-renderer/src/index.ts'),
        },
      ],
    },
    server: {
      port: 5173,
      strictPort: false,
      // Dev-only proxy — localhost default stays in Vite config, not application code.
      proxy: {
        '/form-definition-service': {
          target: formDefinitionServiceTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
    },
  }
})

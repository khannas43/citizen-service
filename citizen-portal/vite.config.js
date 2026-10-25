import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const formDefinitionProxyTarget =
    env.VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: [
        {
          // Prefer ESM builds — CJS default exports break under Vitest/Vite named/default interop.
          find: /^@rjsf\/core$/,
          replacement: path.join(rootDir, 'node_modules/@rjsf/core/dist/index.esm.js'),
        },
        {
          find: /^@rjsf\/validator-ajv8$/,
          replacement: path.join(
            rootDir,
            'node_modules/@rjsf/validator-ajv8/dist/validator-ajv8.esm.js',
          ),
        },
      ],
    },
    optimizeDeps: {
      include: [
        '@rjsf/core',
        '@rjsf/utils',
        '@rjsf/validator-ajv8',
        '@citizen/form-renderer',
        '@citizen/form-widgets',
        '@citizen/form-contract',
      ],
    },
    server: {
      proxy: {
        '/form-definition-service': {
          target: formDefinitionProxyTarget,
          changeOrigin: true,
          rewrite: (pathName) => pathName.replace(/^\/form-definition-service/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      css: true,
      server: {
        deps: {
          inline: [
            '@citizen/form-renderer',
            '@citizen/form-widgets',
            '@citizen/form-contract',
            '@rjsf/validator-ajv8',
            '@rjsf/core',
            '@rjsf/utils',
          ],
        },
      },
    },
  }
})

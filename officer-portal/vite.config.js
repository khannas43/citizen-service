import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const formDefinitionProxyTarget =
    env.VITE_FORM_DEFINITION_SERVICE_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react({ jsxRuntime: 'automatic' })],
    // Vite 8 / Oxc defaults to classic JSX (React.createElement) unless this is set.
    // Classic + no React import leaves the officer SPA blank: "React is not defined".
    oxc: {
      jsx: { runtime: 'automatic' },
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['@dg20/form-builder-app/embed'],
    },
    server: {
      proxy: {
        '/form-definition-service': {
          target: formDefinitionProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/form-definition-service/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      css: true,
    },
  }
})

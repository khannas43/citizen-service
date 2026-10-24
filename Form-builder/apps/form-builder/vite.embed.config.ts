import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packagesDir = path.resolve(rootDir, '../../packages')

/**
 * Library build for host embed (FB-E5.4.3A).
 * Bundles workspace Form packages; externalizes React to the host.
 * Does not use main.tsx.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
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
  build: {
    lib: {
      entry: {
        embed: path.resolve(rootDir, 'src/embed.ts'),
        'embed-styles': path.resolve(rootDir, 'src/embed-styles.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    outDir: path.resolve(rootDir, 'dist/embed'),
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: true,
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom/client',
      ],
      output: {
        assetFileNames: 'embed[extname]',
      },
    },
  },
})

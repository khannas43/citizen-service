import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { StorybookConfig } from '@storybook/react-vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(ts|tsx)',
    // FB-B6: renderer acceptance stories (same Storybook; no competing setup).
    '../../form-renderer/src/**/*.stories.@(ts|tsx)',
  ],
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: false,
  },
  async viteFinal(config) {
    config.resolve = config.resolve ?? {}
    const alias = config.resolve.alias
    const aliasMap = Array.isArray(alias)
      ? Object.fromEntries(
          alias.flatMap((entry) => {
            if (entry && typeof entry === 'object' && 'find' in entry && 'replacement' in entry) {
              return [[String(entry.find), String(entry.replacement)]]
            }
            return []
          }),
        )
      : { ...(alias as Record<string, string> | undefined) }

    config.resolve.alias = {
      ...aliasMap,
      '@dg20/form-renderer': path.resolve(dirname, '../../form-renderer/src'),
    }
    return config
  },
}

export default config

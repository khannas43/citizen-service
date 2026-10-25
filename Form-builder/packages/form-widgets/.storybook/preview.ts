import type { Preview } from '@storybook/react'
import React from 'react'

import { WidgetRuntimeProvider } from '../src/runtime/widget-context'
import type { BilingualContent } from '@citizen/form-contract'

import '../src/styles/tokens.css'
import '../src/styles/widgets.css'

const preview: Preview = {
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
  },
  globalTypes: {
    locale: {
      name: 'Locale',
      description: 'Widget runtime locale',
      defaultValue: 'en',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'gu', title: 'Gujarati' },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const locale = (context.globals.locale as 'en' | 'gu') ?? 'en'
      const bilingual = (context.parameters.bilingual as BilingualContent | undefined) ?? {
        labels: {},
        help: {},
        errors: {},
      }
      return React.createElement(
        'div',
        {
          className: `dg20-form-widgets${locale === 'gu' ? ' dg20-locale-gu' : ''}`,
        },
        React.createElement(
          WidgetRuntimeProvider,
          { locale, bilingual },
          React.createElement(Story),
        ),
      )
    },
  ],
}

export default preview

import { Component } from 'react'
import { withTranslation } from 'react-i18next'

class PublishedFormErrorBoundaryInner extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    // Never log definition, formData, stack, or tokens.
  }

  render() {
    if (this.state.failed) {
      const { t, onReset } = this.props
      return (
        <div className="pf-alert" role="alert">
          <p>{t('publishedForm.rendererError')}</p>
          {onReset ? (
            <button type="button" className="btn-primary" onClick={onReset}>
              {t('publishedForm.retry')}
            </button>
          ) : null}
        </div>
      )
    }
    return this.props.children
  }
}

export const PublishedFormErrorBoundary = withTranslation()(PublishedFormErrorBoundaryInner)

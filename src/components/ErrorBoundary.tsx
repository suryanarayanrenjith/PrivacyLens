import { Component } from 'preact'
import type { ComponentChildren } from 'preact'

interface Props {
  children: ComponentChildren
}

interface State {
  hasError: boolean
  errorMessage: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'An unexpected error occurred.' }
  }

  componentDidCatch(error: Error): void {
    console.error('[PrivacyLens] Uncaught component error:', error)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div class="flex items-center justify-center min-h-[60vh] animate-fade-in">
          <div class="cyber-card lift-on-hover max-w-md text-center p-8 relative">
            <div class="cyber-corners absolute inset-0 pointer-events-none" />
            <div class="text-grade-f text-4xl mb-4 font-mono">[!]</div>
            <h2 class="text-sm font-bold text-white mb-3 tracking-widest uppercase">
              unexpected_error
            </h2>
            <p class="text-xs text-neutral-500 mb-5 font-mono">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              class="cyber-btn cyber-btn-primary"
              onClick={this.handleReset}
            >
              retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
  resetKey?: any
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo)
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null })
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            height: '100%',
            color: 'var(--text-secondary, #8b949e)',
            textAlign: 'center',
            gap: '12px'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #c9d1d9)' }}>
            {this.props.fallbackTitle || 'An unexpected error occurred in this view.'}
          </div>
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              maxWidth: '80%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--text-muted, #6e7681)'
            }}
          >
            {this.state.error?.message || 'Component render error'}
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              borderRadius: '4px',
              background: 'var(--accent, #1f6feb)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Reload View
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

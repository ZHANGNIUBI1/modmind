import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CircleAlert, RotateCcw } from 'lucide-react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error: Error | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      window.dispatchEvent(new ErrorEvent('error', {
        message: `React root error: ${error.message}`,
        error: Object.assign(error, { componentStack: info.componentStack })
      }))
    } catch {
      // The fallback must remain available even when diagnostics are unavailable.
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return <main className="app-fatal-error" role="alert">
      <CircleAlert size={30} />
      <h1>页面遇到错误</h1>
      <p>当前窗口仍在运行，可以重新加载界面继续使用。</p>
      <button className="primary-button" type="button" onClick={() => window.location.reload()}>
        <RotateCcw size={16} />重新加载
      </button>
    </main>
  }
}
